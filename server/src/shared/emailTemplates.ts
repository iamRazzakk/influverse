import { ISendEmail } from "../types/email";

/** Escape user input before it goes into HTML (so a `<script>` in a name can't be injected into the email) */
export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const layout = (title: string, body: string) => `<!doctype html>
<html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:14px;padding:32px">
        <tr><td style="font-size:20px;font-weight:800;letter-spacing:.5px">INFLUVERSE</td></tr>
        <tr><td style="padding-top:20px;font-size:18px;font-weight:700">${escapeHtml(title)}</td></tr>
        <tr><td style="padding-top:12px;font-size:14px;line-height:1.6;color:#333">${body}</td></tr>
        <tr><td style="padding-top:28px;font-size:12px;color:#888">If you didn't request this, you can safely ignore this email.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const button = (href: string, label: string) =>
  `<p style="padding-top:12px"><a href="${escapeHtml(href)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700">${escapeHtml(label)}</a></p>`;

const passwordResetOtp = (v: { to: string; name: string; otp: string; minutes: number }): ISendEmail => ({
  to: v.to,
  subject: "Your INFLUVERSE password reset code",
  html: layout(
    "Reset your password",
    `Hi ${escapeHtml(v.name)},<br/>Use this code to reset your password. It expires in ${v.minutes} minutes.
     <p style="font-size:30px;font-weight:800;letter-spacing:8px;padding:12px 0">${escapeHtml(v.otp)}</p>`,
  ),
});

const emailVerifyOtp = (v: { to: string; name: string; otp: string; minutes: number }): ISendEmail => ({
  to: v.to,
  subject: "Verify your INFLUVERSE email",
  html: layout(
    "Confirm your email",
    `Hi ${escapeHtml(v.name)},<br/>Enter this code to verify your email address. It expires in ${v.minutes} minutes.
     <p style="font-size:30px;font-weight:800;letter-spacing:8px;padding:12px 0">${escapeHtml(v.otp)}</p>`,
  ),
});

const adminInvite = (v: { to: string; name: string; invitedBy: string; role: string; link: string; hours: number }): ISendEmail => ({
  to: v.to,
  subject: "You're invited to the INFLUVERSE admin dashboard",
  html: layout(
    "Admin invitation",
    `Hi ${escapeHtml(v.name)},<br/>${escapeHtml(v.invitedBy)} invited you as <b>${escapeHtml(v.role.replace("_", " "))}</b>.
     This link expires in ${v.hours} hours.${button(v.link, "Accept invitation")}`,
  ),
});

const adminPasswordReset = (v: { to: string; name: string; link: string; minutes: number }): ISendEmail => ({
  to: v.to,
  subject: "Reset your INFLUVERSE admin password",
  html: layout(
    "Reset your password",
    `Hi ${escapeHtml(v.name)},<br/>Click below to set a new password. The link expires in ${v.minutes} minutes.${button(v.link, "Reset password")}`,
  ),
});

/** Email copy of an in-app notification */
const notification = (v: { to: string; name: string; title: string; body?: string; link?: string }): ISendEmail => ({
  to: v.to,
  subject: v.title,
  html: layout(
    v.title,
    `Hi ${escapeHtml(v.name)},<br/>${escapeHtml(v.body ?? "")}${v.link ? button(v.link, "Open INFLUVERSE") : ""}`,
  ),
});

export const emailTemplate = { passwordResetOtp, emailVerifyOtp, adminInvite, adminPasswordReset, notification };
