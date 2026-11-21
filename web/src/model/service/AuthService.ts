import { ServerFacade } from "../../network/ServerFacade.ts";

export class AuthService {
  private serverFacade = new ServerFacade();

  // Creates the account and emails a code to the address. The account can sign
  // in once verifyEmail() succeeds with that code.
  public async register(name: string, email: string, password: string): Promise<void> {
    await this.serverFacade.register(name, email, password);
  }

  public async verifyEmail(email: string, code: string): Promise<void> {
    await this.serverFacade.verifyEmail(email, code);
  }

  public async resendCode(email: string): Promise<void> {
    await this.serverFacade.resendCode(email);
  }

  // Returns the access token to send with every later request.
  public async login(email: string, password: string): Promise<string> {
    return this.serverFacade.login(email, password);
  }

  public async logout(token: string): Promise<void> {
    await this.serverFacade.logout(token);
  }
}
