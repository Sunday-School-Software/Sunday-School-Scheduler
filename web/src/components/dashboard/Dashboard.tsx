import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { formatDate } from "../../dates.ts";
import type { Assignment, Status } from "../../model/Assignment.ts";
import { DashboardPresenter, type DashboardView } from "../../presenter/DashboardPresenter.ts";
import ErrorMessage from "../error/ErrorMessage.tsx";
import { useErrorMessage } from "../error/ErrorMessageHooks.ts";
import { useSession, useSessionActions } from "../session/SessionHooks.ts";

interface Props {
  presenter?: DashboardPresenter;
}

// Every status shows its name as well as its color. Red is kept for errors, so
// a substitute request, a normal answer, doesn't look like something broke.
const statusBadges: Record<Status, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-green-100 text-green-900 dark:bg-green-900/60 dark:text-green-100",
  },
  "substitute requested": {
    label: "Substitute requested",
    className: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
  },
};

export default function Dashboard(props: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const { errorMessage, displayErrorMessage } = useErrorMessage();

  const navigate = useNavigate();
  const { token } = useSession();
  const { clearSession } = useSessionActions();

  const listener: DashboardView = {
    setIsLoading,
    setAssignments,
    displayErrorMessage,
    clearSession,
    navigateToLogin: () => void navigate("/login"),
  };

  const presenterRef = useRef<DashboardPresenter | null>(null);
  if (presenterRef.current == null) {
    presenterRef.current = props.presenter ?? new DashboardPresenter(listener);
  }

  // StrictMode runs this twice in development, which only repeats a read.
  useEffect(() => {
    void presenterRef.current!.loadAssignments(token!);
  }, [token]);

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
        <h1 id="assignments-heading" className="text-2xl font-bold">
          Your assignments
        </h1>
        <p className="mt-2">Your classes for the next 4 Sundays.</p>
        {isLoading && (
          <p role="status" className="mt-6">
            Loading your assignments…
          </p>
        )}
        <ErrorMessage message={errorMessage} className="mt-6" />
        {!isLoading && assignments?.length === 0 && (
          <p className="mt-6">You have no assignments in the next 4 Sundays.</p>
        )}
        {!isLoading && assignments && assignments.length > 0 && (
          <ul aria-labelledby="assignments-heading" className="mt-6 space-y-3">
            {assignments.map((assignment) => (
              <AssignmentCard key={assignment.classId} assignment={assignment} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function AssignmentCard({ assignment }: { assignment: Assignment }) {
  const badge = statusBadges[assignment.status];
  return (
    <li className="rounded-lg border border-gray-300 p-4 dark:border-gray-700">
      <p className="font-semibold">
        <time dateTime={assignment.date}>{formatDate(assignment.date)}</time>
      </p>
      <p className="mt-1 break-words">{assignment.className}</p>
      <p className="mt-2">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </p>
    </li>
  );
}
