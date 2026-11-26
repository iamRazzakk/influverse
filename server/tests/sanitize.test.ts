import sanitizeInput from "../src/app/middlewares/sanitizeInput";

describe("sanitizeInput", () => {
  it("removes $-prefixed and dotted keys at any depth", () => {
    const req: any = {
      body: { a: 1, $where: "x", nested: { "b.c": 1, ok: { $gt: 1, keep: true } }, list: [{ $ne: 1, v: 2 }] },
      query: { role: { $ne: "x" } },
      params: {},
    };
    sanitizeInput(req, {} as any, () => undefined);
    expect(req.body).toEqual({ a: 1, nested: { ok: { keep: true } }, list: [{ v: 2 }] });
    expect(req.query).toEqual({ role: {} });
  });
});
