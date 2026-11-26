import request from "supertest";
import app from "../src/app";

describe("app foundation", () => {
  it("GET /health → 200 + request id header", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("unknown route → 404 JSON", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("CORS: whitelisted origin gets header, others don't", async () => {
    const ok = await request(app).get("/health").set("Origin", "http://localhost:3000");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    const bad = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("Zod validation error → 400 with field path", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation Error");
    const paths = res.body.errorMessages.map((e: { path: string }) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["email", "password"]));
  });

  it("operator injection is stripped before validation", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: { $gt: "" }, password: { $ne: null } });
    expect(res.status).toBe(400); // object → Zod fails, never reaches a DB query
  });

  it("malformed JSON → 400", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Malformed JSON body");
  });
});
