import { ServerFacade } from "../../network/ServerFacade.ts";
import type { Assignment, ResponseStatus } from "../Assignment.ts";

export class ClassService {
  private serverFacade = new ServerFacade();

  // The signed-in user's assignments for the next 4 Sundays, soonest first.
  public async listAssignments(token: string): Promise<Assignment[]> {
    return this.serverFacade.listAssignments(token);
  }

  // Saves the signed-in user's answer for one of their classes.
  public async updateAssignment(
    token: string,
    classId: string,
    status: ResponseStatus,
  ): Promise<Assignment> {
    return this.serverFacade.updateAssignment(token, classId, status);
  }
}
