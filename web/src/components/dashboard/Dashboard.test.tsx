import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Assignment } from "../../model/Assignment.ts";
import { GENERIC_ERROR_MESSAGE } from "../../model/errors.ts";
import { TOKEN_KEY } from "../session/SessionContexts.ts";
import SessionProvider from "../session/SessionProvider.tsx";
import Dashboard from "./Dashboard.tsx";

const originalFetch = globalThis.fetch;
const EMPTY_MESSAGE = "You have no assignments in the next 4 Sundays.";

// jsdom has no fetch (or Response), so build responses as plain objects.
function mockFetch(status: number, body: unknown) {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
  globalThis.fetch = fetchMock;
  return fetchMock;
}

// The real presenter, service and ServerFacade, with only fetch replaced.
function renderDashboard() {
  render(
    <MemoryRouter>
      <SessionProvider>
        <Dashboard />
      </SessionProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.setItem(TOKEN_KEY, "token-123");
});

afterEach(() => {
  sessionStorage.clear();
  globalThis.fetch = originalFetch;
});

describe("Dashboard", () => {
  it("shows that it's loading until the assignments arrive", () => {
    globalThis.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));

    renderDashboard();

    expect(screen.getByRole("status")).toHaveTextContent("Loading your assignments…");
    expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
  });

  it("lists each assignment's date, class and status in the API's order", async () => {
    const assignments: Assignment[] = [
      { classId: "c1", className: "Gospel Doctrine", date: "2026-11-22", status: "pending" },
      { classId: "c2", className: "Youth Sunday School", date: "2026-11-29", status: "confirmed" },
      {
        classId: "c3",
        className: "Gospel Doctrine",
        date: "2026-12-06",
        status: "substitute requested",
      },
    ];
    const fetchMock = mockFetch(200, { assignments });

    renderDashboard();

    const list = await screen.findByRole("list", { name: "Your assignments" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("November 22, 2026Gospel DoctrinePending");
    expect(items[1]).toHaveTextContent("November 29, 2026Youth Sunday SchoolConfirmed");
    expect(items[2]).toHaveTextContent("December 6, 2026Gospel DoctrineSubstitute requested");
    expect(within(items[0]!).getByText("November 22, 2026")).toHaveAttribute("dateTime", "2026-11-22");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assignments",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer token-123" }),
      }),
    );
  });

  it("says so when the teacher has no assignments", async () => {
    mockFetch(200, { assignments: [] });

    renderDashboard();

    expect(await screen.findByText(EMPTY_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["the API fails", () => mockFetch(503, { error: "DynamoDB couldn't be reached." })],
    [
      "the API can't be reached",
      () => {
        globalThis.fetch = jest.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
      },
    ],
  ])("shows the generic error, and no empty message, when %s", async (_, arrange) => {
    arrange();

    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC_ERROR_MESSAGE);
    expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the API's message when the account isn't on the schedule", async () => {
    const message =
      "Your account isn't on the Sunday School schedule yet. Ask a Sunday School leader to add you.";
    mockFetch(403, { error: message });

    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
  });
});
