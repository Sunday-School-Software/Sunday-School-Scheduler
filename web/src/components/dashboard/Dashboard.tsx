import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { formatDate } from "../../dates.ts";
import {
  STATUS_LABELS,
  type Assignment,
  type ResponseStatus,
  type Status,
} from "../../model/Assignment.ts";
import { DashboardPresenter, type DashboardView } from "../../presenter/DashboardPresenter.ts";
import ErrorMessage from "../error/ErrorMessage.tsx";
import { useErrorMessage } from "../error/ErrorMessageHooks.ts";
import { useSession, useSessionActions } from "../session/SessionHooks.ts";

interface Props {
  presenter?: DashboardPresenter;
}

// Every status shows its name as well as its color. Red is kept for errors, so
// a substitute request, a normal answer, doesn't look like something broke.
const badgeClasses: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100",
  confirmed: "bg-green-100 text-green-900 dark:bg-green-900/60 dark:text-green-100",
  "substitute requested": "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
};

const buttonBase =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 aria-disabled:opacity-60";

export default function Dashboard(props: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [savingClassIds, setSavingClassIds] = useState<ReadonlySet<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { errorMessage, displayErrorMessage, clearErrorMessage } = useErrorMessage();

  const navigate = useNavigate();
  const { token } = useSession();
  const { clearSession } = useSessionActions();

  const listener: DashboardView = {
    setIsLoading,
    setAssignments,
    setIsSaving: (classId, isSaving) =>
      setSavingClassIds((current) => {
        const next = new Set(current);
        if (isSaving) {
          next.add(classId);
        } else {
          next.delete(classId);
        }
        return next;
      }),
    updateAssignment: (saved) =>
      setAssignments((current) =>
        current?.map((assignment) => (assignment.classId === saved.classId ? saved : assignment)) ??
        current,
      ),
    displaySuccessMessage: setSuccessMessage,
    clearMessages: () => {
      clearErrorMessage();
      setSuccessMessage(null);
    },
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

  const respond = (classId: string, status: ResponseStatus) => {
    if (savingClassIds.has(classId)) {
      return;
    }
    void presenterRef.current!.respond(token!, classId, status);
  };

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
        {/* Always rendered, so screen readers announce a success message when it appears. */}
        <div role="status">
          {isLoading && <p className="mt-6">Loading your assignments…</p>}
          {successMessage && (
            <p className="mt-6 text-green-800 dark:text-green-300">{successMessage}</p>
          )}
        </div>
        <ErrorMessage message={errorMessage} className="mt-6" />
        {!isLoading && assignments?.length === 0 && (
          <p className="mt-6">You have no assignments in the next 4 Sundays.</p>
        )}
        {!isLoading && assignments && assignments.length > 0 && (
          <ul aria-labelledby="assignments-heading" className="mt-6 space-y-3">
            {assignments.map((assignment) => (
              <AssignmentCard
                key={assignment.classId}
                assignment={assignment}
                isSaving={savingClassIds.has(assignment.classId)}
                onRespond={(status) => respond(assignment.classId, status)}
              />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

interface AssignmentCardProps {
  assignment: Assignment;
  isSaving: boolean;
  onRespond: (status: ResponseStatus) => void;
}

// Offers whichever answers differ from the current status, so a teacher can
// change their mind. While a save is in flight the buttons stay focusable
// (aria-disabled, not disabled), as on the login screen, but do nothing.
function AssignmentCard({ assignment, isSaving, onRespond }: AssignmentCardProps) {
  const id = useId();
  const describedBy = `${id}-date ${id}-class`;
  return (
    <li className="rounded-lg border border-gray-300 p-4 dark:border-gray-700">
      <p id={`${id}-date`} className="font-semibold">
        <time dateTime={assignment.date}>{formatDate(assignment.date)}</time>
      </p>
      <p id={`${id}-class`} className="mt-1 break-words">
        {assignment.className}
      </p>
      <p className="mt-2">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-medium ${badgeClasses[assignment.status]}`}
        >
          {STATUS_LABELS[assignment.status]}
        </span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {assignment.status !== "confirmed" && (
          <button
            type="button"
            aria-disabled={isSaving}
            aria-describedby={describedBy}
            onClick={() => onRespond("confirmed")}
            className={`rounded-md bg-blue-700 px-3 py-1.5 font-semibold text-white hover:bg-blue-800 ${buttonBase}`}
          >
            Confirm
          </button>
        )}
        {assignment.status !== "substitute requested" && (
          <button
            type="button"
            aria-disabled={isSaving}
            aria-describedby={describedBy}
            onClick={() => onRespond("substitute requested")}
            className={`rounded-md border border-gray-400 px-3 py-1.5 font-medium hover:bg-gray-100 dark:hover:bg-gray-800 ${buttonBase}`}
          >
            Request a substitute
          </button>
        )}
      </div>
    </li>
  );
}
