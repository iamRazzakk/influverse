import { ConversationService, type ChatViewer } from "../conversation/conversation.service";
import { USER_ROLE } from "../user/user.constant";
import { ESCROW_HELD_STATUSES, OrderStatus } from "./order.constant";
import { Order } from "./order.model";

/**
 * Workspace dashboard numbers (brand + creator overview pages).
 *
 * Brand:   money = what the brand paid into escrow (`totalCents`), counted in the month it was paid
 *          (`paidAt`); cancelled (refunded) orders are left out. "count" = distinct creators hired.
 * Creator: money = what the creator earned (`priceCents`), counted in the month the work was approved
 *          (`approvedAt`, i.e. when escrow was released). "count" = distinct brands worked with.
 *
 * One indexed, projected query over the viewer's own orders, summed in Node — a single user's order
 * history is small, so no aggregation pipeline is needed.
 */

const BRAND_ACTIVE: OrderStatus[] = ["awaiting_payment", "in_production", "deliverable_submitted", "disputed"];
const CREATOR_ACTIVE: OrderStatus[] = ["in_production", "deliverable_submitted", "disputed"];
const RELEASED: OrderStatus[] = ["approved", "completed"];

const dashboard = async (viewer: ChatViewer, year: number) => {
  const isBrand = viewer.role === USER_ROLE.brand;
  const orders = await Order.find({ [isBrand ? "brandId" : "creatorId"]: viewer.id })
    .select("status totalCents priceCents paidAt approvedAt brandId creatorId")
    .lean();

  // When an order counts for the chart, and how much.
  const countedAt = (o: (typeof orders)[number]) =>
    isBrand ? (o.status !== "cancelled" ? o.paidAt : null) : RELEASED.includes(o.status as OrderStatus) ? o.approvedAt : null;
  const amountOf = (o: (typeof orders)[number]) => (isBrand ? o.totalCents : o.priceCents);
  const counterpartOf = (o: (typeof orders)[number]) => String(isBrand ? o.creatorId : o.brandId);

  const counted = orders.filter((o) => countedAt(o));
  const inYear = counted.filter((o) => new Date(countedAt(o)!).getUTCFullYear() === year);

  // Names for the month tooltips (one batch query for the counterparts of this year).
  const counterpartIds = [...new Set(inYear.map(counterpartOf))];
  const counterparts = await ConversationService.loadCounterparts(isBrand ? USER_ROLE.creator : USER_ROLE.brand, counterpartIds);

  const months = Array.from({ length: 12 }, (_, index) => {
    const rows = inYear.filter((o) => new Date(countedAt(o)!).getUTCMonth() === index);
    const ids = [...new Set(rows.map(counterpartOf))];
    return {
      month: index + 1,
      amountCents: rows.reduce((sum, o) => sum + amountOf(o), 0),
      count: ids.length,
      names: ids.map((id) => counterparts.get(id)?.name ?? (isBrand ? "Creator" : "Brand")),
    };
  });

  const currentYear = new Date().getUTCFullYear();
  const firstYear = counted.reduce((min, o) => Math.min(min, new Date(countedAt(o)!).getUTCFullYear()), currentYear);
  const activeStatuses = isBrand ? BRAND_ACTIVE : CREATOR_ACTIVE;

  return {
    summary: {
      activeCount: orders.filter((o) => activeStatuses.includes(o.status as OrderStatus)).length,
      /** Brand: lifetime spend. Creator: lifetime earnings (released from escrow). */
      lifetimeCents: counted.reduce((sum, o) => sum + amountOf(o), 0),
      /** Money paid in but not yet released to the creator. */
      inEscrowCents: orders
        .filter((o) => ESCROW_HELD_STATUSES.includes(o.status as OrderStatus))
        .reduce((sum, o) => sum + amountOf(o), 0),
      completedCount: orders.filter((o) => RELEASED.includes(o.status as OrderStatus)).length,
    },
    year,
    years: Array.from({ length: currentYear - firstYear + 1 }, (_, i) => currentYear - i),
    yearTotalCents: months.reduce((sum, m) => sum + m.amountCents, 0),
    yearCounterpartsCount: new Set(inYear.map(counterpartOf)).size,
    months,
  };
};

export const OrderStatsService = { dashboard };
