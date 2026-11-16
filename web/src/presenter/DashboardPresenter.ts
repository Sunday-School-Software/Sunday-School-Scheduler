import { AuthService } from "../model/service/AuthService.ts";
import { SignedInPresenter, type SignedInView } from "./Presenter.ts";

export type DashboardView = SignedInView;

export class DashboardPresenter extends SignedInPresenter<DashboardView> {
  private _service = new AuthService();

  public constructor(view: DashboardView) {
    super(view);
  }

  public get service() {
    return this._service;
  }

  // Signs the user out on this device even if the API call fails, so the
  // Sign out button always works. cognito-local, for one, can't sign anyone out.
  public async logOut(token: string) {
    try {
      await this.service.logout(token);
    } catch {
      // Nothing the user can do about it, and they asked to leave.
    }
    this.view.clearSession();
    this.view.navigateToLogin();
  }
}
