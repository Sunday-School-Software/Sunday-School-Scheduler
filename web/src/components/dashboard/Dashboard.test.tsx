import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Assignment, ResponseStatus } from "../../model/Assignment.ts";
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

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
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
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("shows the API's message for a 4xx response", async () => {
    const message = "A message from the API.";
    mockFetch(403, { error: message });

    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
  });

  describe("responding", () => {
    const pending: Assignment = {
      classId: "c1",
      className: "Gospel Doctrine",
      date: "2026-11-22",
      status: "pending",
    };
    const other: Assignment = {
      classId: "c2",
      className: "Youth Sunday School",
      date: "2026-11-29",
      status: "pending",
    };

    function response(status: number, body: unknown) {
      return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
    }

    // GET lists the assignments; PUT answers with what save() returns.
    function mockApi(assignments: Assignment[], save: (status: ResponseStatus) => Promise<Response>) {
      const fetchMock = jest.fn<typeof fetch>((_, init) => {
        if (init?.method === "PUT") {
          const { status } = JSON.parse(init.body as string) as { status: ResponseStatus };
          return save(status);
        }
        return Promise.resolve(response(200, { assignments }));
      });
      globalThis.fetch = fetchMock;
      return fetchMock;
    }

    const saves = (assignment: Assignment) => (status: ResponseStatus) =>
      Promise.resolve(response(200, { assignment: { ...assignment, status } }));

    const putCalls = (fetchMock: ReturnType<typeof mockApi>) =>
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");

    async function findCard(className: string) {
      const list = await screen.findByRole("list", { name: "Your assignments" });
      return within(list)
        .getAllByRole("listitem")
        .find((item) => item.textContent.includes(className))!;
    }

    it.each([
      ["pending", ["Confirm", "Request a substitute"]],
      ["confirmed", ["Request a substitute"]],
      ["substitute requested", ["Confirm"]],
    ] as const)("offers every answer but the current one when the class is %s", async (status, buttons) => {
      mockApi([{ ...pending, status }], saves(pending));

      renderDashboard();

      const card = await findCard("Gospel Doctrine");
      expect(within(card).getAllByRole("button").map((button) => button.textContent)).toEqual(buttons);
    });

    it("names the class and date in each button's description", async () => {
      mockApi([pending], saves(pending));

      renderDashboard();

      const card = await findCard("Gospel Doctrine");
      expect(within(card).getByRole("button", { name: "Confirm" })).toHaveAccessibleDescription(
        "November 22, 2026 Gospel Doctrine",
      );
    });

    it("confirms a class, marks it Confirmed and says so", async () => {
      const fetchMock = mockApi([pending], saves(pending));
      const user = userEvent.setup();
      renderDashboard();
      const card = await findCard("Gospel Doctrine");

      await user.click(within(card).getByRole("button", { name: "Confirm" }));

      expect(await screen.findByText(/is now marked Confirmed/)).toHaveTextContent(
        "Gospel Doctrine on November 22, 2026 is now marked Confirmed.",
      );
      expect(screen.getByRole("status")).toHaveTextContent("is now marked Confirmed.");
      expect(within(card).getByText("Confirmed")).toBeInTheDocument();
      expect(within(card).queryByText("Pending")).not.toBeInTheDocument();
      expect(within(card).queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
      expect(within(card).getByRole("button", { name: "Request a substitute" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/assignments/c1",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ status: "confirmed" }),
          headers: expect.objectContaining({ Authorization: "Bearer token-123" }),
        }),
      );
    });

    it("requests a substitute, marks it Substitute requested and says so", async () => {
      mockApi([pending], saves(pending));
      const user = userEvent.setup();
      renderDashboard();
      const card = await findCard("Gospel Doctrine");

      await user.click(within(card).getByRole("button", { name: "Request a substitute" }));

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Gospel Doctrine on November 22, 2026 is now marked Substitute requested.",
      );
      await waitFor(() => expect(within(card).getByText("Substitute requested")).toBeInTheDocument());
      expect(within(card).getAllByRole("button").map((button) => button.textContent)).toEqual(["Confirm"]);
    });

    it("lets a teacher change their answer", async () => {
      mockApi([pending], saves(pending));
      const user = userEvent.setup();
      renderDashboard();
      const card = await findCard("Gospel Doctrine");

      await user.click(within(card).getByRole("button", { name: "Confirm" }));
      await user.click(await within(card).findByRole("button", { name: "Request a substitute" }));

      expect(await within(card).findByText("Substitute requested")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("is now marked Substitute requested.");
      expect(screen.getByRole("status")).not.toHaveTextContent("Confirmed");
    });

    it.each([
      ["the API fails", () => Promise.resolve(response(503, { error: "Something went wrong. Please try again." }))],
      ["the API can't be reached", () => Promise.reject(new TypeError("Failed to fetch"))],
    ])("shows the generic error and keeps the old status when %s", async (_, save) => {
      mockApi([pending], save);
      const user = userEvent.setup();
      renderDashboard();
      const card = await findCard("Gospel Doctrine");

      await user.click(within(card).getByRole("button", { name: "Confirm" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC_ERROR_MESSAGE);
      expect(within(card).getByText("Pending")).toBeInTheDocument();
      expect(within(card).getAllByRole("button").map((button) => button.textContent)).toEqual([
        "Confirm",
        "Request a substitute",
      ]);
      expect(within(card).getByRole("button", { name: "Confirm" })).toHaveAttribute("aria-disabled", "false");
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("clears an earlier error when the next answer is saved", async () => {
      let attempt = 0;
      mockApi([pending], (status) =>
        ++attempt === 1
          ? Promise.resolve(response(503, {}))
          : Promise.resolve(response(200, { assignment: { ...pending, status } })),
      );
      const user = userEvent.setup();
      renderDashboard();
      const card = await findCard("Gospel Doctrine");

      await user.click(within(card).getByRole("button", { name: "Confirm" }));
      await screen.findByRole("alert");
      await user.click(within(card).getByRole("button", { name: "Confirm" }));

      expect(await screen.findByText(/is now marked Confirmed/)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("disables both of a class's buttons, and only that class's, while its answer saves", async () => {
      let finishSave: (value: Response) => void = () => {};
      const fetchMock = mockApi(
        [pending, other],
        () => new Promise<Response>((resolve) => (finishSave = resolve)),
      );
      const user = userEvent.setup();
      renderDashboard();
      const card = await findCard("Gospel Doctrine");
      const otherCard = await findCard("Youth Sunday School");

      await user.click(within(card).getByRole("button", { name: "Confirm" }));

      for (const button of within(card).getAllByRole("button")) {
        expect(button).toHaveAttribute("aria-disabled", "true");
      }
      for (const button of within(otherCard).getAllByRole("button")) {
        expect(button).toHaveAttribute("aria-disabled", "false");
      }

      await user.click(within(card).getByRole("button", { name: "Confirm" }));
      await user.click(within(card).getByRole("button", { name: "Request a substitute" }));
      expect(putCalls(fetchMock)).toHaveLength(1);

      finishSave(response(200, { assignment: { ...pending, status: "confirmed" } }));

      const remaining = await within(card).findByRole("button", { name: "Request a substitute" });
      await waitFor(() => expect(remaining).toHaveAttribute("aria-disabled", "false"));
    });
  });
});
