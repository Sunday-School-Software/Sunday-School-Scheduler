import { beforeEach, describe, it } from "@jest/globals";
import { anything, instance, mock, spy, verify, when } from "@typestrong/ts-mockito";
import { ApiError, GENERIC_ERROR_MESSAGE } from "../model/errors.ts";
import { AuthService } from "../model/service/AuthService.ts";
import { LoginPresenter, type LoginView } from "./LoginPresenter.ts";

describe("LoginPresenter", () => {
  let mockView: LoginView;
  let mockService: AuthService;
  let presenter: LoginPresenter;

  beforeEach(() => {
    mockView = mock<LoginView>();
    mockService = mock<AuthService>();

    const presenterSpy = spy(new LoginPresenter(instance(mockView)));
    when(presenterSpy.service).thenReturn(instance(mockService));
    presenter = instance(presenterSpy);
  });

  it("signs in with the email and password, saves the token and opens the dashboard", async () => {
    when(mockService.login("teacher@example.com", "Secret-1")).thenResolve("token-123");

    await presenter.doLogin("teacher@example.com", "Secret-1");

    verify(mockView.setIsLoading(true)).calledBefore(mockService.login(anything(), anything()));
    verify(mockView.setSession("token-123")).calledBefore(mockView.navigate("/"));
    verify(mockView.navigate("/")).once();
    verify(mockView.setIsLoading(false)).once();
    verify(mockView.displayErrorMessage(anything())).never();
  });

  it("shows the API's message and stays on the login screen when sign-in fails", async () => {
    when(mockService.login(anything(), anything())).thenReject(
      new ApiError("Wrong email or password."),
    );

    await presenter.doLogin("teacher@example.com", "wrong");

    verify(mockView.displayErrorMessage("Wrong email or password.")).once();
    verify(mockView.setSession(anything())).never();
    verify(mockView.navigate(anything())).never();
    verify(mockView.setIsLoading(false)).once();
  });

  it("shows the generic message when something unexpected fails", async () => {
    when(mockService.login(anything(), anything())).thenReject(new TypeError("boom"));

    await presenter.doLogin("teacher@example.com", "Secret-1");

    verify(mockView.displayErrorMessage(GENERIC_ERROR_MESSAGE)).once();
    verify(mockView.setIsLoading(false)).once();
  });
});
