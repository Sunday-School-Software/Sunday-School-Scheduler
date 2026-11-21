import { useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { authPageStateFrom } from "../../presenter/AuthPageState.ts";
import { LoginPresenter, type LoginView } from "../../presenter/LoginPresenter.ts";
import ErrorMessage from "../error/ErrorMessage.tsx";
import { useErrorMessage } from "../error/ErrorMessageHooks.ts";
import { inputClass, linkClass, primaryButtonClass } from "../form/formStyles.ts";
import { useSessionActions } from "../session/SessionHooks.ts";

interface Props {
  presenter?: LoginPresenter;
}

export default function Login(props: Props) {
  // Set when the person comes here from verifying their email.
  const arrival = authPageStateFrom(useLocation().state);
  const [email, setEmail] = useState(arrival?.email ?? "");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { errorMessage, displayErrorMessage, clearErrorMessage } = useErrorMessage();

  const navigate = useNavigate();
  const { setSession } = useSessionActions();

  const listener: LoginView = {
    setIsLoading,
    setSession,
    navigate: (url, state) => void navigate(url, { state }),
    displayErrorMessage,
  };

  const presenterRef = useRef<LoginPresenter | null>(null);
  if (presenterRef.current == null) {
    presenterRef.current = props.presenter ?? new LoginPresenter(listener);
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isLoading) {
      return;
    }
    clearErrorMessage();
    void presenterRef.current!.doLogin(email, password);
  };

  // The button stays focusable while signing in (aria-disabled, not disabled),
  // so keyboard users don't lose their place if sign-in fails.
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <p className="text-lg font-bold">Sunday School Scheduler</p>
      <h1 className="mt-6 text-2xl font-bold">Sign in</h1>
      {arrival?.notice && (
        <p role="status" className="mt-4">
          {arrival.notice}
        </p>
      )}
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
            aria-describedby={errorMessage ? "login-error" : undefined}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="block font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={errorMessage ? "login-error" : undefined}
            className={inputClass}
          />
        </div>
        <ErrorMessage id="login-error" message={errorMessage} />
        <button type="submit" aria-disabled={isLoading} className={primaryButtonClass}>
          {isLoading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6">
        New here?{" "}
        <Link to="/signup" className={linkClass}>
          Create an account
        </Link>
      </p>
    </main>
  );
}
