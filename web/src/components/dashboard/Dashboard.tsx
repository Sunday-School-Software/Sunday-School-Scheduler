import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { DashboardPresenter, type DashboardView } from "../../presenter/DashboardPresenter.ts";
import { useSession, useSessionActions } from "../session/SessionHooks.ts";

interface Props {
  presenter?: DashboardPresenter;
}

// A scaffold. The teacher's assignments come in #40.
export default function Dashboard(props: Props) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const navigate = useNavigate();
  const { token } = useSession();
  const { clearSession } = useSessionActions();

  const listener: DashboardView = {
    displayErrorMessage: setErrorMessage,
    clearSession,
    navigateToLogin: () => void navigate("/login"),
  };

  const presenterRef = useRef<DashboardPresenter | null>(null);
  if (presenterRef.current == null) {
    presenterRef.current = props.presenter ?? new DashboardPresenter(listener);
  }

  return (
    <>
      <header className="border-b border-gray-300 dark:border-gray-700">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <p className="text-lg font-bold">Sunday School Scheduler</p>
          <button
            type="button"
            onClick={() => void presenterRef.current!.logOut(token!)}
            className="rounded-md border border-gray-400 px-3 py-1.5 font-medium hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:hover:bg-gray-800"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold">Your assignments</h1>
        <p className="mt-2">Your classes for the next 4 Sundays will show here.</p>
        {errorMessage && (
          <p role="alert" className="mt-4 text-red-700 dark:text-red-400">
            {errorMessage}
          </p>
        )}
      </main>
    </>
  );
}
