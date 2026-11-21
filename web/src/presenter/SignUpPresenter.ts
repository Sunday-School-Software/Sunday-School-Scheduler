import { AuthService } from "../model/service/AuthService.ts";
import type { AuthPageState } from "./AuthPageState.ts";
import { Presenter, type View } from "./Presenter.ts";

export interface SignUpView extends View {
  setIsLoading: (isLoading: boolean) => void;
  navigate: (url: string, state: AuthPageState) => void;
}

export class SignUpPresenter extends Presenter<SignUpView> {
  private _service = new AuthService();

  public constructor(view: SignUpView) {
    super(view);
  }

  public get service() {
    return this._service;
  }

  // On success, opens the page where the person enters the code we emailed.
  public async doSignUp(name: string, email: string, password: string) {
    this.view.setIsLoading(true);
    await this.doFailureReportingOperation(
      async () => {
        await this.service.register(name, email, password);
        this.view.navigate("/verify", {
          email: email.trim(),
          notice: `We emailed a code to ${email.trim()}. Enter it below to finish making your account.`,
        });
      },
      () => this.view.setIsLoading(false),
    );
  }
}
