import { beforeEach, describe, it } from "@jest/globals";
import { anything, deepEqual, instance, mock, spy, verify, when } from "@typestrong/ts-mockito";
import { ApiError } from "../model/errors.ts";
import { AuthService } from "../model/service/AuthService.ts";
import { VerifyEmailPresenter, type VerifyEmailView } from "./VerifyEmailPresenter.ts";

const verified = {
  email: "teacher.c@example.com",
  notice: "Your email is verified. Sign in to see your assignments.",
};

describe("VerifyEmailPresenter", () => {
  let mockView: VerifyEmailView;
  let mockService: AuthService;
  let presenter: VerifyEmailPresenter;

  beforeEach(() => {
    mockView = mock<VerifyEmailView>();
    mockService = mock<AuthService>();

    const presenterSpy = spy(new VerifyEmailPresenter(instance(mockView)));
    when(presenterSpy.service).thenReturn(instance(mockService));
    presenter = instance(presenterSpy);
  });

  describe("doVerify", () => {
    it("verifies the email, then opens the login screen with the email filled in", async () => {
      when(mockService.verifyEmail(" teacher.c@example.com ", "123456")).thenResolve();

      await presenter.doVerify(" teacher.c@example.com ", "123456");

      verify(mockView.setIsLoading(true)).calledBefore(mockService.verifyEmail(anything(), anything()));
      verify(mockView.navigate("/login", deepEqual(verified))).once();
      verify(mockView.displayErrorMessage(anything())).never();
      verify(mockView.setIsLoading(false)).once();
    });

    it("shows the API's message and stays put for a wrong code", async () => {
      when(mockService.verifyEmail(anything(), anything())).thenReject(
        new ApiError("That code isn't right.", "wrong-code"),
      );

      await presenter.doVerify("teacher.c@example.com", "000000");

      verify(mockView.displayErrorMessage("That code isn't right.")).once();
      verify(mockView.navigate(anything(), anything())).never();
      verify(mockView.setIsLoading(false)).once();
    });

    it("opens the login screen when the email was already verified", async () => {
      when(mockService.verifyEmail(anything(), anything())).thenReject(
        new ApiError("Your email is already verified. Sign in.", "already-verified"),
      );

      await presenter.doVerify("teacher.c@example.com", "123456");

      verify(mockView.navigate("/login", deepEqual(verified))).once();
      verify(mockView.displayErrorMessage(anything())).never();
    });
  });

  describe("doResend", () => {
    it("asks for a new code and says where it went", async () => {
      when(mockService.resendCode("teacher.c@example.com")).thenResolve();

      await presenter.doResend("teacher.c@example.com");

      verify(mockView.displayNotice("We emailed a new code to teacher.c@example.com.")).once();
      verify(mockView.setIsLoading(false)).once();
    });

    it("shows the API's message when it can't send one", async () => {
      when(mockService.resendCode(anything())).thenReject(
        new ApiError("Too many tries. Wait a few minutes, then try again.", "too-many-attempts"),
      );

      await presenter.doResend("teacher.c@example.com");

      verify(mockView.displayErrorMessage("Too many tries. Wait a few minutes, then try again.")).once();
      verify(mockView.displayNotice(anything())).never();
    });
  });
});
