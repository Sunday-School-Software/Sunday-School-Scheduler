import { useCallback, useMemo, useState, type ReactNode } from "react";
import { SessionActionsContext, SessionContext, TOKEN_KEY } from "./SessionContexts.ts";

export default function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));

  const setSession = useCallback((newToken: string) => {
    sessionStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }, []);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  const session = useMemo(() => ({ token }), [token]);
  const actions = useMemo(() => ({ setSession, clearSession }), [setSession, clearSession]);

  return (
    <SessionContext.Provider value={session}>
      <SessionActionsContext.Provider value={actions}>{children}</SessionActionsContext.Provider>
    </SessionContext.Provider>
  );
}
