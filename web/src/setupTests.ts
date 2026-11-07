import { configure } from "@testing-library/react";
// Adds DOM matchers like toBeInTheDocument() to Jest's expect.
import "@testing-library/jest-dom/jest-globals";

// Render in StrictMode like main.tsx does, so tests catch effect cleanup bugs.
configure({ reactStrictMode: true });
