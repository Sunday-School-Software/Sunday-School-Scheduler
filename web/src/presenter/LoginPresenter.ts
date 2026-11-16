import { AuthService } from "../model/service/AuthService.ts";
import { Presenter, type View } from "./Presenter.ts";

export interface LoginView extends View {
  setIsLoading: (isLoading: boolean) => void;
  setSession: (token: string) => void;
  navigate: (url: string) => void;
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
        const token = await this.service.login(email, password);
        this.view.setSession(token);
        this.view.navigate("/");
      },
      () => this.view.setIsLoading(false),
    );
  }
}
