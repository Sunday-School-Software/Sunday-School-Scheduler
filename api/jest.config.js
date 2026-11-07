/** @type {import("jest").Config} */
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  transform: {
    "^.+\\.ts$": ["@swc/jest"],
  },
  // Source files import each other with .js extensions (Node ESM style).
  // Map those back to the .ts files so Jest can find them.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
