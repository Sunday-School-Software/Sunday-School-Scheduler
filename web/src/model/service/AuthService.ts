import { ServerFacade } from "../../network/ServerFacade.ts";

export class AuthService {
  private serverFacade = new ServerFacade();

  // Returns the access token to send with every later request.
  public async login(email: string, password: string): Promise<string> {
    return this.serverFacade.login(email, password);
  }

  public async logout(token: string): Promise<void> {
    await this.serverFacade.logout(token);
  }
}
