import type { UserRole } from "../app/modules/user/user.constant";
import type { AdminRole } from "../app/modules/admin/admin.constant";

export type AuthUser = {
  kind: "user";
  id: string;
  role: UserRole;
  sid: string;
  email: string;
  name: string;
};

export type AuthAdmin = {
  kind: "admin";
  id: string;
  role: AdminRole;
  sid: string;
  email: string;
  name: string;
};

declare global {
  namespace Express {
    interface Request {
      /** Set by the requestId middleware */
      id: string;
      /** Set after userAuth() (requires a non-null assertion) */
      user?: AuthUser;
      /** Set after adminAuth() */
      admin?: AuthAdmin;
    }
  }
}
