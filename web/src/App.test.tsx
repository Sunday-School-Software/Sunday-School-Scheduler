import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import App from "./App.tsx";
import { TOKEN_KEY } from "./components/session/SessionContexts.ts";
import SessionProvider from "./components/session/SessionProvider.tsx";

const originalFetch = globalThis.fetch;

// jsdom has no fetch (or Response), so every test that renders a component
// that calls the API must mock it. Build responses as plain objects.
function mockFetch(status: number, body: unknown) {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
  globalThis.fetch = fetchMock;
  return fetchMock;
}

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
    const fetchMock = mockFetch(200, { accessToken: "token-123" });
    const user = renderApp("/login");

    await signIn(user, "Secret-1");

    expect(await screen.findByRole("heading", { name: "Your assignments" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/login", expect.objectContaining({ method: "POST" }));
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe("token-123");
  });

  it("shows an error and keeps the email after a failed sign-in", async () => {
    mockFetch(401, { error: "Wrong email or password." });
    const user = renderApp("/login");

    await signIn(user, "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
    expect(screen.getByLabelText("Email")).toHaveValue("teacher@example.com");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("keeps a signed-in user on the dashboard when they reload or open /login", () => {
    sessionStorage.setItem(TOKEN_KEY, "token-123");

    renderApp("/login");

    expect(screen.getByRole("heading", { name: "Your assignments" })).toBeInTheDocument();
  });

  it("signs out, clears the token and returns to the login screen", async () => {
    sessionStorage.setItem(TOKEN_KEY, "token-123");
    const fetchMock = mockFetch(200, {});
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
});
