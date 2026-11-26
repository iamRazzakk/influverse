import express from "express";
import request from "supertest";
import app from "../src/app";
import { jwtHelpers } from "../src/shared/jwt";
import { clearUserSessionCookies, setUserSessionCookies } from "../src/shared/cookie";

/** Website cookie session: cookie flags, CSRF guard on cookie auth, socket tickets. No DB needed. */

const cookieList = (res: request.Response): string[] => {
  const raw = res.headers["set-cookie"] as unknown;
  return Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
};

const tokens = () => ({
  accessToken: jwtHelpers.signAccess("user", { sub: "u1", role: "brand", sid: "s1", ver: 0 }),
  refreshToken: "refresh-token-value",
  refreshExpiresAt: new Date(Date.now() + 86_400_000),
});

const cookieApp = express();
cookieApp.get("/set", (_req, res) => {
  setUserSessionCookies(res, tokens());
  res.end();
});
cookieApp.get("/clear", (_req, res) => {
  clearUserSessionCookies(res);
  res.end();
});

describe("session cookies", () => {
  it("sets httpOnly `at` + `rt` on path / and clears the legacy /api/v1/auth refresh cookie", async () => {
    const cookies = cookieList(await request(cookieApp).get("/set"));

    const at = cookies.find((c) => c.startsWith("at="));
    const rt = cookies.find((c) => c.startsWith("rt=refresh-token-value"));
    const legacy = cookies.find((c) => c.startsWith("rt=;") && c.includes("Path=/api/v1/auth"));

    expect(at).toMatch(/Path=\/;/);
    expect(at).toMatch(/HttpOnly/);
    expect(at).toMatch(/Max-Age=\d+/); // lives as long as the JWT (~15 min)
    expect(rt).toMatch(/Path=\/;/);
    expect(rt).toMatch(/HttpOnly/);
    expect(legacy).toBeDefined();
  });

  it("logout clears `at`, `rt` and the legacy `rt`", async () => {
    const cookies = cookieList(await request(cookieApp).get("/clear"));
    expect(cookies.some((c) => c.startsWith("at=;"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("rt=;") && c.includes("Path=/;"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("rt=;") && c.includes("Path=/api/v1/auth"))).toBe(true);
  });
});

describe("cookie auth CSRF guard", () => {
  it("cookie + unsafe method + foreign origin + no header → 403", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", "at=some-token")
      .set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
  });

  it("cookie + X-Requested-With → passes CSRF, then fails token check (401)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", "at=not-a-jwt")
      .set("X-Requested-With", "influverse-web");
    expect(res.status).toBe(401);
  });

  it("cookie + whitelisted origin → passes CSRF, then fails token check (401)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", "at=not-a-jwt")
      .set("Origin", "http://localhost:3000");
    expect(res.status).toBe(401);
  });

  it("no credentials at all → 401", async () => {
    const res = await request(app).post("/api/v1/auth/logout");
    expect(res.status).toBe(401);
  });
});

describe("socket ticket", () => {
  const claims = { sub: "u1", role: "creator", sid: "s1", ver: 3 };

  it("round-trips", () => {
    const ticket = jwtHelpers.signSocketTicket(claims, 60);
    expect(jwtHelpers.verifySocketTicket(ticket)).toMatchObject({ sub: "u1", sid: "s1", ver: 3, typ: "socket" });
  });

  it("a ticket is not an access token, and an access token is not a ticket", () => {
    const ticket = jwtHelpers.signSocketTicket(claims, 60);
    const access = jwtHelpers.signAccess("user", claims);
    expect(() => jwtHelpers.verifyAccess("user", ticket)).toThrow();
    expect(() => jwtHelpers.verifySocketTicket(access)).toThrow();
  });
});
