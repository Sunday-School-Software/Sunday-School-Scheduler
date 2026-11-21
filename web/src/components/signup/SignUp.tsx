import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { SignUpPresenter, type SignUpView } from "../../presenter/SignUpPresenter.ts";
import ErrorMessage from "../error/ErrorMessage.tsx";
import { useErrorMessage } from "../error/ErrorMessageHooks.ts";
import { inputClass, linkClass, primaryButtonClass } from "../form/formStyles.ts";

interface Props {
  presenter?: SignUpPresenter;
}

export default function SignUp(props: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { errorMessage, displayErrorMessage, clearErrorMessage } = useErrorMessage();

  const navigate = useNavigate();

  const listener: SignUpView = {
    setIsLoading,
    navigate: (url, state) => void navigate(url, { state }),
    displayErrorMessage,
  };

  const presenterRef = useRef<SignUpPresenter | null>(null);
  if (presenterRef.current == null) {
    presenterRef.current = props.presenter ?? new SignUpPresenter(listener);
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isLoading) {
      return;
    }
    clearErrorMessage();
    void presenterRef.current!.doSignUp(name, email, password);
  };

  const describedBy = (hint?: string) =>
    [hint, errorMessage && "signup-error"].filter(Boolean).join(" ") || undefined;

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <p className="text-lg font-bold">Sunday School Scheduler</p>
      <h1 className="mt-6 text-2xl font-bold">Create an account</h1>
      <form className="mt-4 space-y-4" onSubmit={submit}>
        <div>
          <label htmlFor="name" className="block font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-describedby={describedBy()}
            className={inputClass}
          />
        </div>
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
            aria-describedby={describedBy()}
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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={describedBy("password-hint")}
            className={inputClass}
          />
          <p id="password-hint" className="mt-1 text-sm text-gray-700 dark:text-gray-300">
            At least 8 characters, with an uppercase letter, a lowercase letter, a number and a
            symbol.
          </p>
        </div>
        <ErrorMessage id="signup-error" message={errorMessage} />
        <button type="submit" aria-disabled={isLoading} className={primaryButtonClass}>
          {isLoading ? "Creating your account…" : "Create account"}
        </button>
      </form>
      <p className="mt-6">
        Already have an account?{" "}
        <Link to="/login" className={linkClass}>
          Sign in
        </Link>
      </p>
    </main>
  );
}
