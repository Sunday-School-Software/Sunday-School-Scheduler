import { createContext } from "react";

// Where the token is kept. sessionStorage keeps the user signed in when they
// reload the page, and forgets the token when they close the tab.
export const TOKEN_KEY = "accessToken";

export interface Session {
  // The signed-in user's access token, or null when nobody is signed in.
  token: string | null;
}

export interface SessionActions {
  setSession: (token: string) => void;
  clearSession: () => void;
}

export const SessionContext = createContext<Session>({ token: null });

export const SessionActionsContext = createContext<SessionActions>({
  setSession: () => {},
  clearSession: () => {},
});
