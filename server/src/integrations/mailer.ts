import nodemailer, { Transporter } from "nodemailer";
import config from "../config";

let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (!config.email.host || !config.email.user || !config.email.pass) {
    throw new Error("Email is not configured (EMAIL_HOST / EMAIL_USER / EMAIL_PASS)");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      pool: true,
      maxConnections: 5,
      auth: { user: config.email.user, pass: config.email.pass },
    });
  }
  return transporter;
};

/** Returns nodemailer's result; `response` is the SMTP server's reply (e.g. "250 2.0.0 OK"). */
export const sendEmail = async (to: string, subject: string, html: string): Promise<{ response?: string; messageId?: string }> =>
  getTransporter().sendMail({ from: config.email.from, to, subject, html });

/** Checks the SMTP login once at worker start, so a wrong host / password shows up immediately. */
export const verifyMailer = async () => {
  await getTransporter().verify();
};
