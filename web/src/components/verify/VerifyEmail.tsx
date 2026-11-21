import { useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { authPageStateFrom } from "../../presenter/AuthPageState.ts";
import { VerifyEmailPresenter, type VerifyEmailView } from "../../presenter/VerifyEmailPresenter.ts";
import ErrorMessage from "../error/ErrorMessage.tsx";
import { useErrorMessage } from "../error/ErrorMessageHooks.ts";
import { inputClass, linkClass, primaryButtonClass } from "../form/formStyles.ts";

interface Props {
  presenter?: VerifyEmailPresenter;
}

// Opened after signing up, or after signing in to an account that isn't
// verified yet. Both pass the email, so the person only types the code.
export default function VerifyEmail(props: Props) {
  const arrival = authPageStateFrom(useLocation().state);
  const [email, setEmail] = useState(arrival?.email ?? "");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState(
    arrival?.notice ?? "Enter your email and the code we emailed you.",
  );
  const [isLoading, setIsLoading] = useState(false);
  const { errorMessage, displayErrorMessage, clearErrorMessage } = useErrorMessage();

  const navigate = useNavigate();

  const listener: VerifyEmailView = {
    setIsLoading,
    displayNotice: setNotice,
    navigate: (url, state) => void navigate(url, { state }),
    displayErrorMessage,
  };

  const presenterRef = useRef<VerifyEmailPresenter | null>(null);
  if (presenterRef.current == null) {
    presenterRef.current = props.presenter ?? new VerifyEmailPresenter(listener);
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isLoading) {
      return;
    }
    clearErrorMessage();
    void presenterRef.current!.doVerify(email, code);
  };

  const resend = () => {
    if (isLoading) {
      return;
    }
    clearErrorMessage();
    if (!email.trim()) {
      displayErrorMessage("Enter your email, then send a new code.");
      return;
    }
    void presenterRef.current!.doResend(email);
  };

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <p className="text-lg font-bold">Sunday School Scheduler</p>
      <h1 className="mt-6 text-2xl font-bold">Verify your email</h1>
      <p role="status" className="mt-4">
        {notice}
      </p>
      <form className="mt-4 space-y-4" onSubmit={submit}>
        <div>
          <label htmlFor="email" className="block font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={errorMessage ? "verify-error" : undefined}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="code" className="block font-medium">
            Code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-describedby={errorMessage ? "verify-error" : undefined}
            className={inputClass}
          />
        </div>
        <ErrorMessage id="verify-error" message={errorMessage} />
        <button type="submit" aria-disabled={isLoading} className={primaryButtonClass}>
          {isLoading ? "Checking…" : "Verify email"}
        </button>
      </form>
      <p className="mt-6">
        Didn't get a code? Check your spam folder, or{" "}
        <button type="button" onClick={resend} aria-disabled={isLoading} className={linkClass}>
          send a new code
        </button>
        .
      </p>
      <p className="mt-4">
        <Link to="/login" className={linkClass}>
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
