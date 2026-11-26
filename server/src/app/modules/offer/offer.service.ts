import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { CODE_PREFIX, nextCode } from "../../../shared/codeGenerator";
import { withTransaction } from "../../../shared/db";
import { errorLogger } from "../../../shared/logger";
import { SessionService } from "../auth/session.service";
import { ConversationService, type ChatViewer, type ConversationDoc } from "../conversation/conversation.service";
import { Conversation } from "../conversation/conversation.model";
import { SystemMessageType } from "../conversation/conversation.constant";
import { CreatorProfile } from "../creator/creator.model";
import { NotificationService } from "../notification/notification.service";
import { OrderService } from "../order/order.service";
import { Package } from "../package/package.model";
import { Payment } from "../payment/payment.model";
import { PaymentService } from "../payment/payment.service";
import { SettingsService } from "../settings/settings.service";
import { LOGIN_ALLOWED_STATUSES, USER_ROLE } from "../user/user.constant";
import { OFFER_LIMITS, OfferDirection, OfferStatus } from "./offer.constant";
import { effectiveStatus, toOfferView } from "./offer.mapper";
import { Offer } from "./offer.model";

/**
 * Offers (docs/messaging-and-offer-plan.md). Both directions live in one collection:
 * - brand → creator: created from the profile "Send Offer" modal / hire page. The brand's card is
 *   AUTHORIZED (held, not charged) via Stripe Checkout; only then does the creator see the offer.
 *   Creator accepts → hold is CAPTURED and the order starts in production. Decline / withdraw / expiry → hold released.
 * - creator → brand: a custom offer card in the chat. Brand "Accept (€total)" → Stripe Checkout charges
 *   immediately; the webhook then accepts the offer and starts the order.
 *
 * Every status change is ONE conditional update (`status: "pending"` + right party), so a double click
 * or an accept racing a withdraw can only succeed once. Money + order rows change inside a transaction.
 */

type CreateBrandOfferInput = {
  creatorId: string;
  packageId?: string;
  title: string;
  brief: string;
  deliverables: string[];
  platforms: string[];
  priceCents: number;
  deliveryDays: number;
};

type CreateCreatorOfferInput = {
  conversationId: string;
  title: string;
  deliverables: string[];
  platforms: string[];
  priceCents: number;
  deliveryDays: number;
};

type Actor = ChatViewer & { name?: string; email?: string };

const DAY_MS = 24 * 3600 * 1000;
/** An unpaid brand offer (checkout abandoned) is dropped after this. */
const UNPAID_OFFER_TTL_MS = DAY_MS;
/** Card authorizations last ~7 days, so a held offer must be answered within 6. */
const MAX_HOLD_DAYS = 6;

const euros = (cents: number) => `€${(cents / 100).toLocaleString("en-IE", { maximumFractionDigits: 2 })}`;
const feeOf = (offer: { priceCents: number; platformFeePercent: number }) => Math.round((offer.priceCents * offer.platformFeePercent) / 100);

/** Who answers an offer, and who can withdraw it. */
const responderRole = (direction: OfferDirection) => (direction === "brand_to_creator" ? USER_ROLE.creator : USER_ROLE.brand);
const senderRole = (direction: OfferDirection) => (direction === "brand_to_creator" ? USER_ROLE.brand : USER_ROLE.creator);
const partyField = (role: string) => (role === USER_ROLE.brand ? "brandId" : "creatorId");

const ensureAvailable = async (userId: string) => {
  const state = await SessionService.getAuthState("user", userId);
  if (!state || !LOGIN_ALLOWED_STATUSES.includes(state.status as any)) {
    throw new ApiError(StatusCodes.CONFLICT, "This account is no longer available");
  }
};

/** Notification failures never fail the offer action (NotificationService swallows + logs). */
const notify = (
  userId: string,
  type: "offer_received" | "offer_accepted" | "offer_declined" | "offer_expired",
  title: string,
  body: string,
  link: string,
  data: Record<string, unknown>,
) => NotificationService.notifyUser(userId, { type, title, body, link, data }, { email: "offers" });

/** Posts an offer notice in the thread and refreshes the offer card / "offer sent" notice. Never throws. */
const postNotice = async (offer: any, actor: ChatViewer, systemType: SystemMessageType, text: string) => {
  try {
    const conversation = await Conversation.findById(offer.conversationId).lean<ConversationDoc>();
    if (!conversation) return null;
    const view = toOfferView(offer);
    const { message } = await ConversationService.appendMessage({
      conversation,
      actor,
      kind: "system",
      systemType,
      offerId: view.id,
      systemPayload: { offerId: view.id, title: view.title, priceCents: view.priceCents, totalCents: view.totalCents },
      text,
      previewText: systemType === "offer_sent" ? `Offer sent: ${view.title}` : undefined,
    });
    if (offer.messageId) await ConversationService.broadcastMessageUpdate(conversation, String(offer.messageId));
    return message;
  } catch (error: any) {
    errorLogger.error(`offer ${offer._id} chat notice failed: ${error.message}`);
    return null;
  }
};

/** Starts Stripe Checkout that HOLDS the brand's card for a brand → creator offer. */
const startHoldCheckout = (offer: any, brand: Actor) =>
  PaymentService.createCheckout({
    purpose: "offer_hold",
    brandId: String(offer.brandId),
    creatorId: String(offer.creatorId),
    offerId: String(offer._id),
    title: offer.title,
    description: `Offer ${offer.code} — held until the creator accepts`,
    payoutCents: offer.priceCents,
    feeCents: feeOf(offer),
    captureMethod: "manual",
    customerEmail: brand.email,
    successPath: `/brand/campaigns?payment=held`,
    cancelPath: `/brand/campaigns?payment=cancelled`,
  });

/**
 * POST /offers — brand → creator. With `packageId` the price, turnaround and platforms come from
 * the creator's package (the brand can't change a preset rate); without it the brand sets them.
 * Returns the Stripe Checkout URL: the offer reaches the creator once the card is authorized.
 */
const createBrandOffer = async (brand: Actor, input: CreateBrandOfferInput) => {
  if (!(await CreatorProfile.exists({ userId: input.creatorId, isSearchable: true }))) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Creator not found");
  }
  await ensureAvailable(input.creatorId);

  let locked: Partial<Pick<CreateBrandOfferInput, "priceCents" | "deliveryDays" | "platforms">> & { packageTitle?: string } = {};
  if (input.packageId) {
    const pkg = await Package.findOne({ _id: input.packageId, creatorId: input.creatorId, isActive: true, isArchived: false })
      .select("title priceCents deliveryDays platforms")
      .lean();
    if (!pkg) throw new ApiError(StatusCodes.BAD_REQUEST, "This package is no longer available");
    locked = { priceCents: pkg.priceCents, deliveryDays: pkg.deliveryDays, platforms: pkg.platforms as string[], packageTitle: pkg.title };
  }

  const [settings, code, conversation] = await Promise.all([
    SettingsService.getPlatform(),
    nextCode(CODE_PREFIX.offer),
    ConversationService.ensureConversation(brand.id, input.creatorId),
  ]);

  const offer = await Offer.create({
    code,
    direction: "brand_to_creator",
    conversationId: conversation._id,
    brandId: brand.id,
    creatorId: input.creatorId,
    packageId: input.packageId,
    packageTitle: locked.packageTitle,
    title: input.title,
    brief: input.brief,
    deliverables: input.deliverables,
    platforms: locked.platforms ?? input.platforms,
    priceCents: locked.priceCents ?? input.priceCents,
    deliveryDays: locked.deliveryDays ?? input.deliveryDays,
    platformFeePercent: settings.platformFeePercent,
    status: "awaiting_payment",
    expiresAt: new Date(Date.now() + UNPAID_OFFER_TTL_MS),
  });

  const { paymentId, checkoutUrl } = await startHoldCheckout(offer.toObject(), brand);
  await Offer.updateOne({ _id: offer._id }, { $set: { paymentId } });
  return { offer: toOfferView({ ...offer.toObject(), paymentId }), checkoutUrl };
};

/** POST /offers/:id/checkout — brand reopens payment for an offer whose checkout was abandoned. */
const resumeCheckout = async (brand: Actor, offerId: string) => {
  const offer = await Offer.findOne({ _id: offerId, brandId: brand.id, direction: "brand_to_creator" }).lean();
  if (!offer) throw new ApiError(StatusCodes.NOT_FOUND, "Offer not found");
  if (offer.status !== "awaiting_payment") throw new ApiError(StatusCodes.CONFLICT, "This offer doesn't need a payment");
  if (offer.paymentId) await PaymentService.releaseHold(String(offer.paymentId)); // close the old checkout page

  const { paymentId, checkoutUrl } = await startHoldCheckout(offer, brand);
  await Offer.updateOne(
    { _id: offerId, status: "awaiting_payment" },
    { $set: { paymentId, expiresAt: new Date(Date.now() + UNPAID_OFFER_TTL_MS) } },
  );
  return { checkoutUrl };
};

/**
 * Webhook: the brand's card is authorized for a brand → creator offer.
 * The offer becomes visible to the creator (pending), the chat gets the "Offer sent" notice.
 */
const onHoldAuthorized = async (paymentId: string) => {
  const payment = await Payment.findById(paymentId).lean();
  if (!payment?.offerId) return;

  const settings = await SettingsService.getPlatform();
  const answerDays = Math.min(settings.offerExpiryDays, MAX_HOLD_DAYS);
  const offer = await Offer.findOneAndUpdate(
    { _id: payment.offerId, status: "awaiting_payment", paymentId: payment._id },
    { $set: { status: "pending", expiresAt: new Date(Date.now() + answerDays * DAY_MS) } },
    { new: true },
  ).lean();
  if (!offer) {
    // Offer was dropped / re-paid with another checkout meanwhile → don't keep the money on hold.
    await PaymentService.releaseHold(paymentId);
    return;
  }

  const brand = { id: String(offer.brandId), role: USER_ROLE.brand } as ChatViewer;
  const message = await postNotice(
    offer,
    brand,
    "offer_sent",
    `Offer sent: a collaboration proposal for "${offer.title}" (${euros(offer.priceCents)}) was sent. The payment is held in escrow until the creator accepts.`,
  );
  if (message) await Offer.updateOne({ _id: offer._id }, { $set: { messageId: message.id } });

  const brandName = await ConversationService.senderDisplayName(brand);
  void notify(String(offer.creatorId), "offer_received", `New offer from ${brandName}`, `${offer.title} — ${euros(offer.priceCents)}`, "/creator/offers", {
    offerId: String(offer._id),
  });
};

/** POST /offers/custom — creator → brand, sent inside an existing chat thread. */
const createCreatorOffer = async (creator: Actor, input: CreateCreatorOfferInput) => {
  const conversation = await Conversation.findOne({ _id: input.conversationId, creatorId: creator.id, kind: { $ne: "support" } }).lean<ConversationDoc>();
  if (!conversation) throw new ApiError(StatusCodes.NOT_FOUND, "Conversation not found");
  await ensureAvailable(String(conversation.brandId));

  const [settings, code] = await Promise.all([SettingsService.getPlatform(), nextCode(CODE_PREFIX.offer)]);
  const offer = await Offer.create({
    code,
    direction: "creator_to_brand",
    conversationId: conversation._id,
    brandId: conversation.brandId,
    creatorId: creator.id,
    title: input.title,
    deliverables: input.deliverables,
    platforms: input.platforms,
    priceCents: input.priceCents,
    deliveryDays: input.deliveryDays,
    platformFeePercent: settings.platformFeePercent,
    expiresAt: new Date(Date.now() + settings.offerExpiryDays * DAY_MS),
  });

  const { message } = await ConversationService.appendMessage({
    conversation,
    actor: creator,
    kind: "offer",
    offerId: String(offer._id),
    text: "",
    previewText: `Custom offer: ${input.title}`,
  });
  await Offer.updateOne({ _id: offer._id }, { $set: { messageId: message.id } });

  const creatorName = await ConversationService.senderDisplayName(creator);
  void notify(
    String(conversation.brandId),
    "offer_received",
    `Custom offer from ${creatorName}`,
    `${input.title} — ${euros(input.priceCents)}`,
    `/brand/messages?conv=${conversation._id}`,
    { offerId: String(offer._id), conversationId: String(conversation._id) },
  );
  return message;
};

/**
 * The escrow is paid for an accepted offer: create the in-production order and link everything,
 * in one transaction (money flow — DoD #6).
 */
const createPaidOrder = (offer: any, paymentId: string) =>
  withTransaction(async (session) => {
    const order = await OrderService.createFromOffer(offer, { paymentId, paidAt: new Date() }, session);
    await Offer.updateOne({ _id: offer._id }, { $set: { orderId: order._id } }, { session });
    await Payment.updateOne({ _id: paymentId }, { $set: { orderId: order._id } }, { session });
    return order;
  });

const acceptedText = (actorName: string, title: string, priceCents: number) =>
  `Offer accepted: ${actorName} accepted the proposal for "${title}" (${euros(priceCents)}). The escrow is funded and production has started.`;

/**
 * Creator accepts a brand offer: claim the offer, capture the held payment, start the order.
 * If the hold can't be captured any more (expired), the offer expires and both sides are told.
 */
const acceptBrandOffer = async (creator: Actor, current: any) => {
  const now = new Date();
  const claimed = await Offer.findOneAndUpdate(
    { _id: current._id, status: "pending", expiresAt: { $gt: now } },
    { $set: { status: "accepted", respondedAt: now } },
    { new: true },
  ).lean();
  if (!claimed) {
    const status = effectiveStatus(current);
    throw new ApiError(StatusCodes.CONFLICT, status === "expired" ? "This offer has expired" : `This offer is already ${status}`);
  }

  const capture = claimed.paymentId
    ? await PaymentService.captureHold(String(claimed.paymentId))
    : ({ ok: false, expired: true, message: "No payment on this offer" } as const);

  if (!capture.ok) {
    if (capture.expired) {
      const expired = await Offer.findOneAndUpdate({ _id: claimed._id }, { $set: { status: "expired" } }, { new: true }).lean();
      await postNotice(expired, creator, "offer_expired", `Offer expired: the payment hold for "${claimed.title}" is no longer valid. The brand can send a new offer.`);
      void notify(String(claimed.brandId), "offer_expired", "Your offer's payment hold expired", claimed.title, "/brand/campaigns", { offerId: String(claimed._id) });
      throw new ApiError(StatusCodes.CONFLICT, "The brand's payment hold has expired, so this offer can't be accepted any more");
    }
    // Temporary Stripe problem → give the offer back so the creator can retry.
    await Offer.updateOne({ _id: claimed._id, status: "accepted" }, { $set: { status: "pending" }, $unset: { respondedAt: 1 } });
    throw new ApiError(StatusCodes.BAD_GATEWAY, "Payment could not be completed right now. Please try again.");
  }

  const order = await createPaidOrder(claimed, String(claimed.paymentId));
  const accepted = { ...claimed, orderId: order._id };
  const actorName = await ConversationService.senderDisplayName(creator);
  await postNotice(accepted, creator, "offer_accepted", acceptedText(actorName, claimed.title, claimed.priceCents));
  void notify(String(claimed.brandId), "offer_accepted", `${actorName} accepted your offer`, claimed.title, `/brand/campaigns`, {
    offerId: String(claimed._id),
    orderId: String(order._id),
  });
  return toOfferView(accepted);
};

/** Brand accepts a creator's custom offer → Stripe Checkout (charged now). The webhook finishes the accept. */
const startCustomOfferPayment = async (brand: Actor, current: any) => {
  if (effectiveStatus(current) !== "pending") {
    throw new ApiError(StatusCodes.CONFLICT, effectiveStatus(current) === "expired" ? "This offer has expired" : `This offer is already ${current.status}`);
  }
  const conversationPath = `/brand/messages?conv=${current.conversationId}`;
  const { paymentId, checkoutUrl } = await PaymentService.createCheckout({
    purpose: "custom_offer_accept",
    brandId: brand.id,
    creatorId: String(current.creatorId),
    offerId: String(current._id),
    title: current.title,
    description: `Custom offer ${current.code}`,
    payoutCents: current.priceCents,
    feeCents: feeOf(current),
    captureMethod: "automatic",
    customerEmail: brand.email,
    successPath: `${conversationPath}&payment=success`,
    cancelPath: `${conversationPath}&payment=cancelled`,
  });
  await Offer.updateOne({ _id: current._id }, { $set: { paymentId } });
  return { ...toOfferView(current), checkoutUrl };
};

/**
 * Webhook: the brand paid for a creator's custom offer. Accept it and start the order.
 * If the offer stopped being pending meanwhile (creator withdrew it), the payment is refunded.
 */
const onCustomOfferPaid = async (paymentId: string) => {
  const payment = await Payment.findById(paymentId).lean();
  if (!payment?.offerId) return;

  const now = new Date();
  // A paid offer is honoured even if its expiry passed during checkout.
  const claimed = await Offer.findOneAndUpdate(
    { _id: payment.offerId, status: "pending" },
    { $set: { status: "accepted", respondedAt: now, paymentId: payment._id } },
    { new: true },
  ).lean();

  if (!claimed) {
    const offer = await Offer.findById(payment.offerId).lean();
    // Same payment already turned into the order (duplicate event) → nothing to do.
    if (offer?.status === "accepted" && String(offer.paymentId) === paymentId) return;
    await PaymentService.refund(paymentId);
    void notify(String(payment.brandId), "offer_declined", "Payment refunded", "The custom offer was no longer available, so your payment was refunded.", "/brand/campaigns", {
      offerId: String(payment.offerId),
    });
    return;
  }

  const order = await createPaidOrder(claimed, paymentId);
  const brand = { id: String(claimed.brandId), role: USER_ROLE.brand } as ChatViewer;
  const actorName = await ConversationService.senderDisplayName(brand);
  await postNotice({ ...claimed, orderId: order._id }, brand, "offer_accepted", acceptedText(actorName, claimed.title, claimed.priceCents));
  void notify(String(claimed.creatorId), "offer_accepted", `${actorName} accepted your offer`, `${claimed.title} — escrow funded, you can start.`, `/creator/campaigns`, {
    offerId: String(claimed._id),
    orderId: String(order._id),
  });
};

/** The text of the chat notice for decline / withdraw. */
const noticeText = (type: "offer_declined" | "offer_withdrawn", actorName: string, title: string, priceCents: number) =>
  type === "offer_declined"
    ? `Offer declined: ${actorName} declined the proposal for "${title}" (${euros(priceCents)}).`
    : `Offer withdrawn: ${actorName} withdrew the proposal for "${title}".`;

/**
 * Accept / decline (the receiving party) or withdraw (the sending party).
 * - accept, brand → creator: capture the hold + start the order (acceptBrandOffer).
 * - accept, creator → brand: returns a Stripe Checkout URL (startCustomOfferPayment).
 * - decline / withdraw: one conditional update, then any held money is released.
 */
const changeStatus = async (viewer: Actor, offerId: string, action: "accept" | "decline" | "withdraw", reason?: string) => {
  const current = await Offer.findOne({ _id: offerId, [partyField(viewer.role)]: viewer.id }).lean();
  // Creators never see a brand offer before it is paid.
  if (!current || (viewer.role === USER_ROLE.creator && current.status === "awaiting_payment")) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Offer not found");
  }

  const direction = current.direction as OfferDirection;
  const allowedRole = action === "withdraw" ? senderRole(direction) : responderRole(direction);
  if (viewer.role !== allowedRole) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      action === "withdraw" ? "Only the sender can withdraw this offer" : "Only the receiver can answer this offer",
    );
  }

  if (action === "accept") {
    return direction === "brand_to_creator" ? acceptBrandOffer(viewer, current) : startCustomOfferPayment(viewer, current);
  }

  const nextStatus: OfferStatus = action === "decline" ? "declined" : "withdrawn";
  const now = new Date();
  // A brand may also withdraw an offer it never paid for.
  const fromStatuses = action === "withdraw" ? ["pending", "awaiting_payment"] : ["pending"];
  const updated = await Offer.findOneAndUpdate(
    { _id: offerId, status: { $in: fromStatuses }, ...(action === "decline" ? { expiresAt: { $gt: now } } : {}) },
    { $set: { status: nextStatus, respondedAt: now, ...(reason ? { declineReason: reason } : {}) } },
    { new: true },
  ).lean();
  if (!updated) {
    const status = effectiveStatus(current);
    throw new ApiError(StatusCodes.CONFLICT, status === "expired" ? "This offer has expired" : `This offer is already ${status}`);
  }

  if (updated.paymentId) await PaymentService.releaseHold(String(updated.paymentId));

  if (current.status === "pending") {
    const actorName = await ConversationService.senderDisplayName(viewer);
    const type = nextStatus === "declined" ? "offer_declined" : "offer_withdrawn";
    await postNotice(updated, viewer, type, noticeText(type, actorName, updated.title, updated.priceCents));
    if (action === "decline") {
      const senderId = String(direction === "brand_to_creator" ? updated.brandId : updated.creatorId);
      const link = senderRole(direction) === USER_ROLE.brand ? `/brand/campaigns` : `/creator/messages?conv=${updated.conversationId}`;
      void notify(senderId, "offer_declined", `${actorName} declined your offer`, updated.title, link, { offerId: String(updated._id) });
    }
  }
  return toOfferView(updated);
};

/**
 * Worker job: closes offers past their deadline (the lazy "expired" status becomes real) and
 * releases their payment holds. Unpaid drafts are dropped the same way.
 */
const expireStale = async () => {
  const now = new Date();
  const stale = await Offer.find({ status: { $in: ["pending", "awaiting_payment"] }, expiresAt: { $lte: now } })
    .limit(200)
    .lean();
  for (const offer of stale) {
    const expired = await Offer.findOneAndUpdate(
      { _id: offer._id, status: offer.status, expiresAt: { $lte: now } },
      { $set: { status: "expired" } },
      { new: true },
    ).lean();
    if (!expired) continue;
    if (expired.paymentId) await PaymentService.releaseHold(String(expired.paymentId));
    if (offer.status === "pending") {
      const sender = { id: String(direction(expired) === "brand_to_creator" ? expired.brandId : expired.creatorId), role: senderRole(direction(expired)) } as ChatViewer;
      await postNotice(expired, sender, "offer_expired", `Offer expired: "${expired.title}" was not answered in time.${expired.paymentId ? " The payment hold was released." : ""}`);
    }
  }
  return stale.length;
};
const direction = (offer: any) => offer.direction as OfferDirection;

/**
 * GET /offers?box=received|sent&status= — the viewer's offers, newest first.
 * Each row carries the other party's card (name / avatar / handle) for the list UI.
 */
const list = async (viewer: ChatViewer, query: { box: "received" | "sent"; status?: OfferStatus; page: number; limit: number }) => {
  const dir: OfferDirection = (query.box === "received") === (viewer.role === USER_ROLE.creator) ? "brand_to_creator" : "creator_to_brand";
  const filter: Record<string, unknown> = { [partyField(viewer.role)]: viewer.id, direction: dir };

  const now = new Date();
  if (query.status === "pending") Object.assign(filter, { status: "pending", expiresAt: { $gt: now } });
  else if (query.status === "expired") Object.assign(filter, { $or: [{ status: "expired" }, { status: "pending", expiresAt: { $lte: now } }] });
  else if (query.status === "awaiting_payment") Object.assign(filter, { status: "awaiting_payment", expiresAt: { $gt: now } });
  else if (query.status) filter.status = query.status;
  // Creators never see unpaid brand offers.
  if (viewer.role === USER_ROLE.creator && dir === "brand_to_creator" && !query.status) filter.status = { $ne: "awaiting_payment" };

  const [rows, total] = await Promise.all([
    Offer.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    Offer.countDocuments(filter),
  ]);

  const otherRole = viewer.role === USER_ROLE.brand ? USER_ROLE.creator : USER_ROLE.brand;
  const otherIds = rows.map((o) => String(otherRole === USER_ROLE.brand ? o.brandId : o.creatorId));
  const counterparts = await ConversationService.loadCounterparts(otherRole, otherIds);

  return {
    items: rows
      .filter((o) => !(viewer.role === USER_ROLE.creator && o.status === "awaiting_payment"))
      .map((o) => ({
        ...toOfferView(o),
        counterpart: counterparts.get(String(otherRole === USER_ROLE.brand ? o.brandId : o.creatorId)) ?? null,
      })),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
};

/** GET /offers/pending-count — badge on the creator's "Offers" menu item. */
const pendingReceivedCount = (viewer: ChatViewer) =>
  Offer.countDocuments({
    [partyField(viewer.role)]: viewer.id,
    direction: viewer.role === USER_ROLE.creator ? "brand_to_creator" : "creator_to_brand",
    status: "pending",
    expiresAt: { $gt: new Date() },
  });

const getOne = async (viewer: ChatViewer, offerId: string) => {
  const offer = await Offer.findOne({ _id: offerId, [partyField(viewer.role)]: viewer.id }).lean();
  if (!offer || (viewer.role === USER_ROLE.creator && offer.status === "awaiting_payment")) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Offer not found");
  }
  return toOfferView(offer);
};

export const OfferService = {
  createBrandOffer,
  resumeCheckout,
  onHoldAuthorized,
  createCreatorOffer,
  onCustomOfferPaid,
  changeStatus,
  expireStale,
  list,
  pendingReceivedCount,
  getOne,
  LIMITS: OFFER_LIMITS,
};
