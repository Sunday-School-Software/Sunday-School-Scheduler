import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { LoginPresenter, type LoginView } from "../../presenter/LoginPresenter.ts";
import { useSessionActions } from "../session/SessionHooks.ts";

interface Props {
  presenter?: LoginPresenter;
}

const inputClass =
  "mt-1 w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-base dark:bg-gray-900";

export default function Login(props: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const navigate = useNavigate();
  const { setSession } = useSessionActions();

  const listener: LoginView = {
    setIsLoading,
    setSession,
    navigate: (url) => void navigate(url),
    displayErrorMessage: setErrorMessage,
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
    setErrorMessage(null);
    void presenterRef.current!.doLogin(email, password);
  };

  // The button stays focusable while signing in (aria-disabled, not disabled),
  // so keyboard users don't lose their place if sign-in fails.
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <p className="text-lg font-bold">Sunday School Scheduler</p>
      <h1 className="mt-6 text-2xl font-bold">Sign in</h1>
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
        {errorMessage && (
          <p id="login-error" role="alert" className="text-red-700 dark:text-red-400">
            {errorMessage}
          </p>
        )}
        <button
          type="submit"
          aria-disabled={isLoading}
          className="w-full rounded-md bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 aria-disabled:opacity-60"
        >
          {isLoading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
