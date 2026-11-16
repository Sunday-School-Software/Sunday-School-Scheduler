import { describe, expect, it } from "@jest/globals";
import { act, render, renderHook, screen } from "@testing-library/react";
import ErrorMessage from "./ErrorMessage.tsx";
import { useErrorMessage } from "./ErrorMessageHooks.ts";

describe("ErrorMessage", () => {
  it("shows nothing without a message", () => {
    render(<ErrorMessage message={null} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("announces the message with the given id and class", () => {
    render(<ErrorMessage message="Try again." id="form-error" className="mt-4" />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Try again.");
    expect(alert).toHaveAttribute("id", "form-error");
    expect(alert).toHaveClass("mt-4", "text-red-700");
  });
});

describe("useErrorMessage", () => {
  it("displays and clears a message", () => {
    const { result } = renderHook(() => useErrorMessage());
    expect(result.current.errorMessage).toBeNull();

    act(() => result.current.displayErrorMessage("Try again."));
    expect(result.current.errorMessage).toBe("Try again.");

    act(() => result.current.clearErrorMessage());
    expect(result.current.errorMessage).toBeNull();
  });
});
