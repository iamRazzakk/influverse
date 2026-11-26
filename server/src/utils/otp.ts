import { randomInt } from "crypto";

/** 6 digit OTP string (keeps leading zeros) — crypto random (audit #12) */
const generateOTP = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

export default generateOTP;
