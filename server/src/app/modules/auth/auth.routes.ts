import express from "express";
import { userAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { authLimiter, otpLimiter, otpPerEmailLimiter, refreshLimiter } from "../../../shared/rateLimiter";
import { AuthController } from "./auth.controller";
import { AuthValidation } from "./auth.validation";

const router = express.Router();

router.post("/register", authLimiter, validateRequest(AuthValidation.register), AuthController.register);
router.post("/login", authLimiter, validateRequest(AuthValidation.login), AuthController.login);
router.post("/refresh", refreshLimiter, AuthController.refresh);
router.post("/logout", userAuth(), AuthController.logout);
router.post("/logout-all", userAuth(), AuthController.logoutAll);

router.post("/forgot-password", otpLimiter, validateRequest(AuthValidation.forgotPassword), otpPerEmailLimiter, AuthController.forgotPassword);
router.post("/verify-otp", otpLimiter, validateRequest(AuthValidation.verifyOtp), otpPerEmailLimiter, AuthController.verifyOtp);
// Email verification for the logged-in user (code is sent automatically on register).
router.post("/resend-verification", otpLimiter, userAuth(), AuthController.sendEmailVerification);
router.post("/verify-email", otpLimiter, userAuth(), validateRequest(AuthValidation.verifyEmail), AuthController.verifyEmail);
router.post("/reset-password", authLimiter, validateRequest(AuthValidation.resetPassword), AuthController.resetPassword);
router.post(
  "/change-password",
  authLimiter,
  userAuth(),
  validateRequest(AuthValidation.changePassword),
  AuthController.changePassword,
);

router.post("/socket-ticket", userAuth(), AuthController.socketTicket);

router.get("/sessions", userAuth(), AuthController.listSessions);
router.delete("/sessions/:id", userAuth(), validateRequest(AuthValidation.sessionIdParam), AuthController.revokeSession);

export const AuthRoutes = router;
