import bcrypt from "bcrypt";
import config from "../config";

export const hashPassword = (plain: string) => bcrypt.hash(plain, config.bcryptSaltRounds);

// Takes the same time even if the user doesn't exist (so timing can't reveal whether an email exists)
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("influverse-timing-equaliser", config.bcryptSaltRounds));

export const verifyPassword = async (plain: string, hash: string | null | undefined): Promise<boolean> => {
  if (!hash) {
    await bcrypt.compare(plain, await getDummyHash());
    return false;
  }
  return bcrypt.compare(plain, hash);
};
