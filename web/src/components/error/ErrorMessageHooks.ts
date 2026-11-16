import { useState } from "react";

// The error message a view shows. displayErrorMessage fits View's
// displayErrorMessage, so a view can hand it straight to its presenter.
export function useErrorMessage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  return {
    errorMessage,
    displayErrorMessage: setErrorMessage,
    clearErrorMessage: () => setErrorMessage(null),
  };
}
