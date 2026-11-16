import { beforeEach, describe, it } from "@jest/globals";
import { anything, instance, mock, spy, verify, when } from "@typestrong/ts-mockito";
import { ApiError, UnauthorizedError } from "../model/errors.ts";
import { AuthService } from "../model/service/AuthService.ts";
import { DashboardPresenter, type DashboardView } from "./DashboardPresenter.ts";

describe("DashboardPresenter", () => {
  let mockView: DashboardView;
  let mockService: AuthService;
  let presenter: DashboardPresenter;

  beforeEach(() => {
    mockView = mock<DashboardView>();
    mockService = mock<AuthService>();

    const presenterSpy = spy(new DashboardPresenter(instance(mockView)));
    when(presenterSpy.service).thenReturn(instance(mockService));
    presenter = instance(presenterSpy);
  });

  it("signs out with the token, clears the session and returns to the login screen", async () => {
    await presenter.logOut("token-123");

    verify(mockService.logout("token-123")).calledBefore(mockView.clearSession());
    verify(mockView.clearSession()).once();
    verify(mockView.navigateToLogin()).once();
  });

  it.each([
    ["the API fails", new ApiError("Couldn't sign out. Please try again.")],
    ["the token was already rejected", new UnauthorizedError()],
  ])("still signs out on this device when %s", async (_, error) => {
    when(mockService.logout(anything())).thenReject(error);

    await presenter.logOut("token-123");

    verify(mockView.clearSession()).once();
    verify(mockView.navigateToLogin()).once();
    verify(mockView.displayErrorMessage(anything())).never();
  });
});
