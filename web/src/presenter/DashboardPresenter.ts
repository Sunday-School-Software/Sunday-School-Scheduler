import { formatDate } from "../dates.ts";
import { STATUS_LABELS, type Assignment, type ResponseStatus } from "../model/Assignment.ts";
import { AuthService } from "../model/service/AuthService.ts";
import { ClassService } from "../model/service/ClassService.ts";
import { SignedInPresenter, type SignedInView } from "./Presenter.ts";

export interface DashboardView extends SignedInView {
  setIsLoading: (isLoading: boolean) => void;
  setAssignments: (assignments: Assignment[]) => void;
  setIsSaving: (classId: string, isSaving: boolean) => void;
  // Replaces the shown assignment that has the same classId.
  updateAssignment: (assignment: Assignment) => void;
  displaySuccessMessage: (message: string) => void;
  clearMessages: () => void;
}

export class DashboardPresenter extends SignedInPresenter<DashboardView> {
  private _authService = new AuthService();
  private _classService = new ClassService();

  public constructor(view: DashboardView) {
    super(view);
  }

  public get authService() {
    return this._authService;
  }

  public get classService() {
    return this._classService;
  }

  public async loadAssignments(token: string) {
    this.view.setIsLoading(true);
    await this.doFailureReportingOperation(
      async () => {
        this.view.setAssignments(await this.classService.listAssignments(token));
      },
      () => this.view.setIsLoading(false),
    );
  }

  // Confirms the class or requests a substitute. If the save fails, the
  // assignment on screen keeps its old status.
  public async respond(token: string, classId: string, status: ResponseStatus) {
    this.view.clearMessages();
    this.view.setIsSaving(classId, true);
    await this.doFailureReportingOperation(
      async () => {
        const saved = await this.classService.updateAssignment(token, classId, status);
        this.view.updateAssignment(saved);
        this.view.displaySuccessMessage(
          `${saved.className} on ${formatDate(saved.date)} is now marked ${STATUS_LABELS[saved.status]}.`,
        );
      },
      () => this.view.setIsSaving(classId, false),
    );
  }

  // Signs the user out on this device even if the API call fails, so the
  // Sign out button always works. cognito-local, for one, can't sign anyone out.
  public async logOut(token: string) {
    try {
      await this.authService.logout(token);
    } catch {
      // Nothing the user can do about it, and they asked to leave.
    }
    this.view.clearSession();
    this.view.navigateToLogin();
  }
}
