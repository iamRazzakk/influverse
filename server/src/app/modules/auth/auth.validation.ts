import { z } from "zod";
import { zEmail, zName, zObjectId, zPassword, zPhone } from "../../../shared/zod";
import { USER_ROLES } from "../user/user.constant";

const register = z.object({
  body: z
    .object({
      role: z.enum(USER_ROLES as [string, ...string[]]),
      name: zName,
      email: zEmail,
      password: zPassword,
      phone: zPhone.optional(),
      rememberMe: z.boolean().default(true),
    })
    .strict(),
});

const login = z.object({
  body: z.object({
    email: zEmail,
    password: z.string().min(1, "Password is required").max(128),
    rememberMe: z.boolean().default(true),
  }),
});

const forgotPassword = z.object({ body: z.object({ email: zEmail }) });

const verifyOtp = z.object({
  body: z.object({
    email: zEmail,
    otp: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .pipe(z.string().regex(/^\d{6}$/, "Code must be 6 digits")),
  }),
});

const verifyEmail = z.object({
  body: z.object({
    otp: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .pipe(z.string().regex(/^\d{6}$/, "Code must be 6 digits")),
  }),
});

const resetPassword = z.object({
  body: z.object({ resetToken: z.string().min(1), password: zPassword }),
});

const changePassword = z.object({
  body: z
    .object({ currentPassword: z.string().min(1), newPassword: zPassword })
    .refine((v) => v.currentPassword !== v.newPassword, {
      message: "New password must be different",
      path: ["newPassword"],
    }),
});

const sessionIdParam = z.object({ params: z.object({ id: zObjectId }) });

export const AuthValidation = {
  register,
  login,
  forgotPassword,
  verifyOtp,
  verifyEmail,
  resetPassword,
  changePassword,
  sessionIdParam,
};
