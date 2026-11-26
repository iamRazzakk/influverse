import request from "supertest";
import app from "../src/app";

/**
 * Chat routes must never answer without a valid user token.
 * (Service behaviour — idempotent sends, unread counters, cursors, access scoping — needs Mongo + Redis
 * and is covered by the integration checklist in docs/messaging-and-offer-plan.md §7.)
 */
describe("conversation + offer routes — auth guard", () => {
  const id = "65a1b2c3d4e5f6a7b8c9d0e1";
  const cases: [string, string][] = [
    ["get", "/api/v1/conversations"],
    ["get", "/api/v1/conversations/unread-count"],
    ["post", "/api/v1/conversations"],
    ["get", `/api/v1/conversations/${id}`],
    ["get", `/api/v1/conversations/${id}/messages`],
    ["post", `/api/v1/conversations/${id}/messages`],
    ["post", `/api/v1/conversations/${id}/read`],
    ["delete", `/api/v1/conversations/${id}`],
    ["delete", `/api/v1/conversations/${id}/messages/${id}`],
    ["get", "/api/v1/offers"],
    ["get", "/api/v1/offers/pending-count"],
    ["post", "/api/v1/offers"],
    ["post", "/api/v1/offers/custom"],
    ["post", `/api/v1/offers/${id}/accept`],
    ["post", `/api/v1/offers/${id}/decline`],
    ["post", `/api/v1/offers/${id}/withdraw`],
    ["get", "/api/v1/orders"],
    ["get", `/api/v1/orders/${id}`],
  ];

  it.each(cases)("%s %s without token → 401", async (method, path) => {
    const res = await (request(app) as any)[method](path).send({ text: "hi" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("garbage bearer token → 401", async () => {
    const res = await request(app).get("/api/v1/conversations").set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
  });
});
