import { useContext } from "react";
import { SessionActionsContext, SessionContext } from "./SessionContexts.ts";

export const useSession = () => useContext(SessionContext);

export const useSessionActions = () => useContext(SessionActionsContext);
