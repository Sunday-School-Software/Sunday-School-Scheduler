import { ApiError } from "../model/errors.ts";
import { AuthService } from "../model/service/AuthService.ts";
import type { AuthPageState } from "./AuthPageState.ts";
import { Presenter, type View } from "./Presenter.ts";

export interface LoginView extends View {
  setIsLoading: (isLoading: boolean) => void;
  setSession: (token: string) => void;
  navigate: (url: string, state?: AuthPageState) => void;
}

export class LoginPresenter extends Presenter<LoginView> {
  private _service = new AuthService();

  public constructor(view: LoginView) {
    super(view);
  }

  public get service() {
    return this._service;
  }

  public async doLogin(email: string, password: string) {
    this.view.setIsLoading(true);
    await this.doFailureReportingOperation(
      async () => {
        let token;
        try {
          token = await this.service.login(email, password);
        } catch (error) {
          // The password was right, but the account hasn't verified its email
          // yet, so take the person to enter the code instead of stopping here.
          if (error instanceof ApiError && error.problem === "not-verified") {
            this.view.navigate("/verify", { email: email.trim(), notice: error.message });
            return;
          }
          throw error;
        }
        this.view.setSession(token);
        this.view.navigate("/");
      },
      () => this.view.setIsLoading(false),
    );
  }
}
