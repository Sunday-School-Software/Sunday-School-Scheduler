// Run every test west of UTC, as in Utah, so CI (which runs in UTC) catches a
// YYYY-MM-DD date shown a day early. Jest's workers inherit this.
process.env.TZ = "America/Denver";

/** @type {import("jest").Config} */
export default {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  setupFiles: ["<rootDir>/test/polyfills.cjs"],
  setupFilesAfterEnv: ["<rootDir>/src/setupTests.ts"],
  // Vite handles CSS and asset imports in the app. Jest can't load them, so swap in stubs.
  moduleNameMapper: {
    "\\.css$": "<rootDir>/test/styleStub.cjs",
    "\\.(svg|png|jpe?g|gif|webp|ico)(\\?.*)?$": "<rootDir>/test/fileStub.cjs",
  },
  transform: {
    "^.+\\.tsx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", tsx: true },
          transform: { react: { runtime: "automatic" } },
        },
      },
    ],
  },
};
