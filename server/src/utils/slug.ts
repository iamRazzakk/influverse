import { randomBytes } from "crypto";

export const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Unique slug — checks `exists`; on collision appends a short random suffix */
export const uniqueSlug = async (base: string, exists: (slug: string) => Promise<boolean>) => {
  const root = slugify(base) || "brand";
  if (!(await exists(root))) return root;
  for (let i = 0; i < 5; i++) {
    const candidate = `${root}-${randomBytes(3).toString("hex")}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root}-${randomBytes(6).toString("hex")}`;
};
