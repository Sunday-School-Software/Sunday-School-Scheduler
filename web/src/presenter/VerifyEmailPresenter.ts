import { ApiError } from "../model/errors.ts";
import { AuthService } from "../model/service/AuthService.ts";
import type { AuthPageState } from "./AuthPageState.ts";
import { Presenter, type View } from "./Presenter.ts";

export interface VerifyEmailView extends View {
  setIsLoading: (isLoading: boolean) => void;
  displayNotice: (message: string) => void;
  navigate: (url: string, state: AuthPageState) => void;
}

export class VerifyEmailPresenter extends Presenter<VerifyEmailView> {
  private _service = new AuthService();

  public constructor(view: VerifyEmailView) {
    super(view);
  }

  public get service() {
    return this._service;
  }

  // On success, or if the email was already verified, opens the login screen
  // with the email filled in.
  public async doVerify(email: string, code: string) {
    this.view.setIsLoading(true);
    await this.doFailureReportingOperation(
      async () => {
        try {
          await this.service.verifyEmail(email, code);
        } catch (error) {
          if (!(error instanceof ApiError && error.problem === "already-verified")) {
            throw error;
          }
        }
        this.view.navigate("/login", {
          email: email.trim(),
          notice: "Your email is verified. Sign in to see your assignments.",
        });
      },
      () => this.view.setIsLoading(false),
    );
  }

  public async doResend(email: string) {
    this.view.setIsLoading(true);
    await this.doFailureReportingOperation(
      async () => {
        await this.service.resendCode(email);
        this.view.displayNotice(`We emailed a new code to ${email.trim()}.`);
      },
      () => this.view.setIsLoading(false),
    );
  }
}
