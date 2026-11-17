import { beforeEach, describe, it } from "@jest/globals";
import { anything, deepEqual, instance, mock, spy, verify, when } from "@typestrong/ts-mockito";
import type { Assignment } from "../model/Assignment.ts";
import { ApiError, GENERIC_ERROR_MESSAGE, UnauthorizedError } from "../model/errors.ts";
import { AuthService } from "../model/service/AuthService.ts";
import { ClassService } from "../model/service/ClassService.ts";
import { DashboardPresenter, type DashboardView } from "./DashboardPresenter.ts";

describe("DashboardPresenter", () => {
  let mockView: DashboardView;
  let mockAuthService: AuthService;
  let mockClassService: ClassService;
  let presenter: DashboardPresenter;

  beforeEach(() => {
    mockView = mock<DashboardView>();
    mockAuthService = mock<AuthService>();
    mockClassService = mock<ClassService>();

    const presenterSpy = spy(new DashboardPresenter(instance(mockView)));
    when(presenterSpy.authService).thenReturn(instance(mockAuthService));
    when(presenterSpy.classService).thenReturn(instance(mockClassService));
    presenter = instance(presenterSpy);
  });

  describe("loadAssignments", () => {
    const assignments: Assignment[] = [
      { classId: "c1", className: "Gospel Doctrine", date: "2026-11-22", status: "pending" },
      { classId: "c2", className: "Gospel Doctrine", date: "2026-11-29", status: "confirmed" },
    ];

    it("shows the assignments it gets with the token", async () => {
      when(mockClassService.listAssignments("token-123")).thenResolve(assignments);

      await presenter.loadAssignments("token-123");

      verify(mockView.setIsLoading(true)).calledBefore(mockClassService.listAssignments(anything()));
      verify(mockView.setAssignments(deepEqual(assignments))).calledBefore(mockView.setIsLoading(false));
      verify(mockView.setIsLoading(false)).once();
      verify(mockView.displayErrorMessage(anything())).never();
    });

    it("shows an empty list when the teacher has no assignments", async () => {
      when(mockClassService.listAssignments(anything())).thenResolve([]);

      await presenter.loadAssignments("token-123");

      verify(mockView.setAssignments(deepEqual([]))).once();
      verify(mockView.displayErrorMessage(anything())).never();
    });

    it.each([
      ["the API's message for an ApiError", new ApiError("Ask a leader."), "Ask a leader."],
      ["the generic message for other errors", new Error("internal detail"), GENERIC_ERROR_MESSAGE],
    ])("shows %s and no list", async (_, error, message) => {
      when(mockClassService.listAssignments(anything())).thenReject(error);

      await presenter.loadAssignments("token-123");

      verify(mockView.displayErrorMessage(message)).once();
      verify(mockView.setAssignments(anything())).never();
      verify(mockView.setIsLoading(false)).once();
    });

    it("returns to the login screen without an error when the API rejects the token", async () => {
      when(mockClassService.listAssignments(anything())).thenReject(new UnauthorizedError());

      await presenter.loadAssignments("token-123");

      verify(mockView.clearSession()).calledBefore(mockView.navigateToLogin());
      verify(mockView.displayErrorMessage(anything())).never();
      verify(mockView.setAssignments(anything())).never();
    });
  });

  describe("respond", () => {
    const pending: Assignment = {
      classId: "c1",
      className: "Gospel Doctrine",
      date: "2026-11-22",
      status: "pending",
    };

    it.each([
      ["confirmed", "Gospel Doctrine on November 22, 2026 is now marked Confirmed."],
      [
        "substitute requested",
        "Gospel Doctrine on November 22, 2026 is now marked Substitute requested.",
      ],
    ] as const)("saves %s, shows the saved assignment and names its status", async (status, message) => {
      const saved: Assignment = { ...pending, status };
      when(mockClassService.updateAssignment("token-123", "c1", status)).thenResolve(saved);

      await presenter.respond("token-123", "c1", status);

      verify(mockView.clearMessages()).calledBefore(mockView.setIsSaving("c1", true));
      verify(mockView.setIsSaving("c1", true)).calledBefore(
        mockClassService.updateAssignment(anything(), anything(), anything()),
      );
      verify(mockView.updateAssignment(deepEqual(saved))).once();
      verify(mockView.displaySuccessMessage(message)).once();
      verify(mockView.setIsSaving("c1", false)).once();
      verify(mockView.displayErrorMessage(anything())).never();
    });

    it.each([
      ["the generic message when the save fails", new ApiError(), GENERIC_ERROR_MESSAGE],
      ["the generic message for other errors", new Error("internal detail"), GENERIC_ERROR_MESSAGE],
      [
        "the API's message when the class isn't theirs",
        new ApiError("You're not assigned to that class."),
        "You're not assigned to that class.",
      ],
    ])("shows %s and keeps the old status", async (_, error, message) => {
      when(mockClassService.updateAssignment(anything(), anything(), anything())).thenReject(error);

      await presenter.respond("token-123", "c1", "confirmed");

      verify(mockView.displayErrorMessage(message)).once();
      verify(mockView.updateAssignment(anything())).never();
      verify(mockView.displaySuccessMessage(anything())).never();
      verify(mockView.setIsSaving("c1", false)).once();
    });

    it("returns to the login screen without an error when the API rejects the token", async () => {
      when(mockClassService.updateAssignment(anything(), anything(), anything())).thenReject(
        new UnauthorizedError(),
      );

      await presenter.respond("token-123", "c1", "confirmed");

      verify(mockView.clearSession()).calledBefore(mockView.navigateToLogin());
      verify(mockView.displayErrorMessage(anything())).never();
      verify(mockView.updateAssignment(anything())).never();
    });
  });

  describe("logOut", () => {
    it("signs out with the token, clears the session and returns to the login screen", async () => {
      await presenter.logOut("token-123");

      verify(mockAuthService.logout("token-123")).calledBefore(mockView.clearSession());
      verify(mockView.clearSession()).once();
      verify(mockView.navigateToLogin()).once();
    });

    it.each([
      ["the API fails", new ApiError("Couldn't sign out. Please try again.")],
      ["the token was already rejected", new UnauthorizedError()],
    ])("still signs out on this device when %s", async (_, error) => {
      when(mockAuthService.logout(anything())).thenReject(error);

      await presenter.logOut("token-123");

      verify(mockView.clearSession()).once();
      verify(mockView.navigateToLogin()).once();
      verify(mockView.displayErrorMessage(anything())).never();
    });
  });
});
