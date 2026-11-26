import { derivePackageType } from "../src/app/modules/package/package.constant";
import { summarisePlatforms, toCreatorCard } from "../src/app/modules/creator/creator.mapper";
import { formatCount } from "../src/utils/format";
import { escapeRegex } from "../src/utils/regex";
import { withId } from "../src/utils/dto";
import { hasPermission } from "../src/app/modules/admin/admin.constant";

describe("package type derivation", () => {
  it.each([
    [["instagram", "tiktok"], "bundle"],
    [["ugc"], "ugc_video"],
    [["youtube"], "video"],
    [["instagram"], "reel"],
    [["tiktok"], "reel"],
  ])("%j → %s", (platforms, expected) => {
    expect(derivePackageType(platforms)).toBe(expected);
  });
});

describe("creator platform summary", () => {
  it("counts only platforms with a handle", () => {
    expect(
      summarisePlatforms({
        instagram: { handle: "anna", followers: 1000 },
        tiktok: { handle: "", followers: 5000 },
        youtube: { handle: "annayt", followers: 250 },
      }),
    ).toEqual({ platformKeys: ["instagram", "youtube"], followersTotal: 1250 });
  });

  it("handles missing platforms", () => {
    expect(summarisePlatforms(undefined)).toEqual({ platformKeys: [], followersTotal: 0 });
  });

  it("card exposes formatted followers and no private fields", () => {
    const card = toCreatorCard({
      userId: "665f1c000000000000000001",
      handle: "anna",
      platforms: { instagram: { handle: "anna", followers: 450_000, engagementRate: 4.8 } },
      followersTotal: 450_000,
      contactEmail: "secret@example.com",
    });
    expect(card.followersFormatted).toBe("450K");
    expect(card.platforms[0]).toMatchObject({ platform: "instagram", followersFormatted: "450K" });
    expect(card).not.toHaveProperty("contactEmail");
  });
});

describe("utils", () => {
  it("formatCount", () => {
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1_500)).toBe("1.5K");
    expect(formatCount(1_200_000)).toBe("1.2M");
  });

  it("escapeRegex neutralises regex metacharacters", () => {
    expect(new RegExp(escapeRegex("a.*(b)+")).test("a.*(b)+")).toBe(true);
    expect(new RegExp(`^${escapeRegex(".*")}$`).test("anything")).toBe(false);
  });

  it("withId replaces _id with string id", () => {
    expect(withId({ _id: { toString: () => "abc" }, name: "x" })).toEqual({ id: "abc", name: "x" });
  });
});

describe("admin RBAC", () => {
  it("moderator cannot arbitrate money, super admin can manage team", () => {
    expect(hasPermission("moderator", "orders.force_release")).toBe(false);
    expect(hasPermission("moderator", "users.suspend")).toBe(true);
    expect(hasPermission("admin", "team.manage")).toBe(false);
    expect(hasPermission("super_admin", "team.manage")).toBe(true);
  });
});
