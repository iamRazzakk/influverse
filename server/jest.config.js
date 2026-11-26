module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  // config import er AGE test env set (setupFiles → module load er age chole)
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  moduleFileExtensions: ["ts", "js"],
  clearMocks: true,
};
