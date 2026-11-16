import { ApiError, GENERIC_ERROR_MESSAGE, UnauthorizedError } from "../model/errors.ts";

export interface View {
  displayErrorMessage: (message: string) => void;
}

// A view that only a signed-in user sees.
export interface SignedInView extends View {
  clearSession: () => void;
  navigateToLogin: () => void;
}

export abstract class Presenter<V extends View> {
  private _view: V;

  protected constructor(view: V) {
    this._view = view;
  }

  protected get view() {
    return this._view;
  }

  // Runs the operation and shows the user any error it throws. An ApiError's
  // message is meant for the user; anything else gets the generic message.
  protected async doFailureReportingOperation(
    operation: () => Promise<void>,
    cleanupOperation: () => void = () => {},
  ) {
    try {
      await operation();
    } catch (error) {
      this.handleError(error);
    } finally {
      cleanupOperation();
    }
  }

  protected handleError(error: unknown) {
    this.view.displayErrorMessage(
      error instanceof ApiError ? error.message : GENERIC_ERROR_MESSAGE,
    );
  }
}

// Presenters for signed-in views send the user back to the login screen when
// the API rejects their token.
export abstract class SignedInPresenter<V extends SignedInView> extends Presenter<V> {
  protected override handleError(error: unknown) {
    if (error instanceof UnauthorizedError) {
      this.view.clearSession();
      this.view.navigateToLogin();
      return;
    }
    super.handleError(error);
  }
}
