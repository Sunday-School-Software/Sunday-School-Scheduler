import { ServerFacade } from "../../network/ServerFacade.ts";
import type { Assignment } from "../Assignment.ts";

export class ClassService {
  private serverFacade = new ServerFacade();

  // The signed-in user's assignments for the next 4 Sundays, soonest first.
  public async listAssignments(token: string): Promise<Assignment[]> {
    return this.serverFacade.listAssignments(token);
  }
}
