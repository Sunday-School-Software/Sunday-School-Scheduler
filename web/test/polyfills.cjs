// jsdom has no TextEncoder, and React Router needs it.
const { TextEncoder } = require("node:util");

globalThis.TextEncoder ??= TextEncoder;
