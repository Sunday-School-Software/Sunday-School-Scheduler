/** @type {import("jest").Config} */
export default {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
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
