import { beforeEach, describe, it } from "@jest/globals";
import { anything, deepEqual, instance, mock, spy, verify, when } from "@typestrong/ts-mockito";
import { ApiError, GENERIC_ERROR_MESSAGE } from "../model/errors.ts";
import { AuthService } from "../model/service/AuthService.ts";
import { SignUpPresenter, type SignUpView } from "./SignUpPresenter.ts";

describe("SignUpPresenter", () => {
  let mockView: SignUpView;
  let mockService: AuthService;
  let presenter: SignUpPresenter;

  beforeEach(() => {
    mockView = mock<SignUpView>();
    mockService = mock<AuthService>();

    const presenterSpy = spy(new SignUpPresenter(instance(mockView)));
    when(presenterSpy.service).thenReturn(instance(mockService));
    presenter = instance(presenterSpy);
  });

  it("creates the account, then opens the verify page with the email", async () => {
    when(mockService.register("Teacher C", " teacher.c@example.com", "Secret-1")).thenResolve();

    await presenter.doSignUp("Teacher C", " teacher.c@example.com", "Secret-1");

    verify(mockView.setIsLoading(true)).calledBefore(mockService.register(anything(), anything(), anything()));
    verify(
      mockView.navigate(
        "/verify",
        deepEqual({
          email: "teacher.c@example.com",
          notice: "We emailed a code to teacher.c@example.com. Enter it below to finish making your account.",
        }),
      ),
    ).once();
    verify(mockView.displayErrorMessage(anything())).never();
    verify(mockView.setIsLoading(false)).once();
  });

  it("shows the API's message and stays put when the email is taken", async () => {
    when(mockService.register(anything(), anything(), anything())).thenReject(
      new ApiError("There's already an account with this email. Sign in instead.", "exists"),
    );

    await presenter.doSignUp("Teacher C", "teacher.c@example.com", "Secret-1");

    verify(mockView.displayErrorMessage("There's already an account with this email. Sign in instead.")).once();
    verify(mockView.navigate(anything(), anything())).never();
    verify(mockView.setIsLoading(false)).once();
  });

  it("shows the generic message when something unexpected fails", async () => {
    when(mockService.register(anything(), anything(), anything())).thenReject(new TypeError("boom"));

    await presenter.doSignUp("Teacher C", "teacher.c@example.com", "Secret-1");

    verify(mockView.displayErrorMessage(GENERIC_ERROR_MESSAGE)).once();
  });
});
