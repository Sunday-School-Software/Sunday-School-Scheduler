import { beforeEach, describe, it } from "@jest/globals";
import { anything, instance, mock, verify } from "@typestrong/ts-mockito";
import { ApiError, GENERIC_ERROR_MESSAGE, UnauthorizedError } from "../model/errors.ts";
import { SignedInPresenter, type SignedInView } from "./Presenter.ts";

// Stands in for the signed-in presenters to come, such as the dashboard's
// assignments (#40).
class TestPresenter extends SignedInPresenter<SignedInView> {
  public constructor(view: SignedInView) {
    super(view);
  }

  public async run(operation: () => Promise<void>) {
    await this.doFailureReportingOperation(operation);
  }
}

describe("SignedInPresenter", () => {
  let mockView: SignedInView;
  let presenter: TestPresenter;

  beforeEach(() => {
    mockView = mock<SignedInView>();
    presenter = new TestPresenter(instance(mockView));
  });

  it("clears the session and returns to the login screen when the API rejects the token", async () => {
    await presenter.run(() => Promise.reject(new UnauthorizedError("You're not signed in.")));

    verify(mockView.clearSession()).calledBefore(mockView.navigateToLogin());
    verify(mockView.navigateToLogin()).once();
    verify(mockView.displayErrorMessage(anything())).never();
  });

  it("shows other API errors and keeps the user signed in", async () => {
    await presenter.run(() => Promise.reject(new ApiError("Something broke.")));

    verify(mockView.displayErrorMessage("Something broke.")).once();
    verify(mockView.clearSession()).never();
    verify(mockView.navigateToLogin()).never();
  });

  it("shows the generic message for errors that aren't from the API", async () => {
    await presenter.run(() => Promise.reject(new Error("internal detail")));

    verify(mockView.displayErrorMessage(GENERIC_ERROR_MESSAGE)).once();
    verify(mockView.clearSession()).never();
  });
});
