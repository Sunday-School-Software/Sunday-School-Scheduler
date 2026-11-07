import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import App from "./App.tsx";

const originalFetch = globalThis.fetch;

// jsdom has no fetch (or Response), so every test that renders a component
// that calls the API must mock it. Build responses as plain objects.
function mockFetch(response: Partial<Response>) {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(response as Response);
  globalThis.fetch = fetchMock;
  return fetchMock;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("App", () => {
  it("shows the API status when the health check succeeds", async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "ok" }),
    });

    render(<App />);

    expect(await screen.findByText(/"status": "ok"/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.anything());
  });

  it("shows an error when the API returns an error status", async () => {
    mockFetch({ ok: false, status: 502 });

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 502");
  });

  it("shows an error when the API can't be reached", async () => {
    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("Failed to fetch"));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");
  });
});
