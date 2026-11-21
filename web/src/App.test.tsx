import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import App from "./App.tsx";
import { TOKEN_KEY } from "./components/session/SessionContexts.ts";
import SessionProvider from "./components/session/SessionProvider.tsx";

const originalFetch = globalThis.fetch;

// jsdom has no fetch (or Response), so every test that renders a component
// that calls the API must mock it. Build responses as plain objects. Each
// path gets its own [status, body], and the dashboard loads assignments as
// soon as it opens, so tests that reach it answer /api/assignments.
function mockFetch(responses: Record<string, [number, unknown]>) {
  const fetchMock = jest.fn<typeof fetch>((input) => {
    const [status, body] = (typeof input === "string" && responses[input]) || [404, {}];
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response);
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

const NO_ASSIGNMENTS: [number, unknown] = [200, { assignments: [] }];

function renderApp(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function signIn(user: ReturnType<typeof userEvent.setup>, password: string) {
  await user.type(screen.getByLabelText("Email"), "teacher@example.com");
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("App", () => {
  it.each(["/", "/somewhere"])("sends a signed-out visitor who opens %s to the login screen", (path) => {
    renderApp(path);

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your assignments" })).not.toBeInTheDocument();
  });

  it("opens the dashboard after a successful sign-in", async () => {
    const fetchMock = mockFetch({
      "/api/login": [200, { accessToken: "token-123" }],
      "/api/assignments": NO_ASSIGNMENTS,
    });
    const user = renderApp("/login");

    await signIn(user, "Secret-1");

    expect(await screen.findByRole("heading", { name: "Your assignments" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/login", expect.objectContaining({ method: "POST" }));
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe("token-123");
  });

  it("shows an error and keeps the email after a failed sign-in", async () => {
    mockFetch({ "/api/login": [401, { error: "Wrong email or password." }] });
    const user = renderApp("/login");

    await signIn(user, "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
    expect(screen.getByLabelText("Email")).toHaveValue("teacher@example.com");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("keeps a signed-in user on the dashboard when they reload or open /login", async () => {
    sessionStorage.setItem(TOKEN_KEY, "token-123");
    mockFetch({ "/api/assignments": NO_ASSIGNMENTS });

    renderApp("/login");

    expect(screen.getByRole("heading", { name: "Your assignments" })).toBeInTheDocument();
    expect(
      await screen.findByText("You have no assignments in the next 4 Sundays."),
    ).toBeInTheDocument();
  });

  it("returns to the login screen when the API rejects the token while loading assignments", async () => {
    sessionStorage.setItem(TOKEN_KEY, "expired-token");
    mockFetch({ "/api/assignments": [401, { error: "You're not signed in." }] });

    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("signs out, clears the token and returns to the login screen", async () => {
    sessionStorage.setItem(TOKEN_KEY, "token-123");
    const fetchMock = mockFetch({ "/api/logout": [200, {}], "/api/assignments": NO_ASSIGNMENTS });
    const user = renderApp("/");

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/logout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token-123" }),
      }),
    );
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("walks a new person through signing up, verifying their email and signing in", async () => {
    const fetchMock = mockFetch({
      "/api/register": [201, {}],
      "/api/register/verify": [200, {}],
      "/api/login": [200, { accessToken: "token-123" }],
      "/api/assignments": NO_ASSIGNMENTS,
    });
    const user = renderApp("/login");

    await user.click(screen.getByRole("link", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Name"), "Teacher C");
    await user.type(screen.getByLabelText("Email"), "teacher@example.com");
    await user.type(screen.getByLabelText("Password"), "Secret-1");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("We emailed a code to teacher@example.com.");
    await user.type(screen.getByLabelText("Code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify email" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Your email is verified.");
    expect(screen.getByLabelText("Email")).toHaveValue("teacher@example.com");
    await user.type(screen.getByLabelText("Password"), "Secret-1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("You have no assignments in the next 4 Sundays."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/register/verify",
      expect.objectContaining({ body: JSON.stringify({ email: "teacher@example.com", code: "123456" }) }),
    );
  });

  it("says so, and stays on the sign-up page, when the email already has an account", async () => {
    mockFetch({
      "/api/register": [409, { error: "There's already an account with this email. Sign in instead.", problem: "exists" }],
    });
    const user = renderApp("/signup");

    await user.type(screen.getByLabelText("Name"), "Teacher C");
    await user.type(screen.getByLabelText("Email"), "teacher@example.com");
    await user.type(screen.getByLabelText("Password"), "Secret-1");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "There's already an account with this email. Sign in instead.",
    );
    expect(screen.getByRole("heading", { name: "Create an account" })).toBeInTheDocument();
  });

  it("sends someone who signs in before verifying to enter their code", async () => {
    mockFetch({
      "/api/login": [403, { error: "Verify your email before you sign in.", problem: "not-verified" }],
    });
    const user = renderApp("/login");

    await signIn(user, "Secret-1");

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Verify your email before you sign in.");
    expect(screen.getByLabelText("Email")).toHaveValue("teacher@example.com");
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
