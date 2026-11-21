import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { anything, instance, mock, verify } from "@typestrong/ts-mockito";
import { MemoryRouter } from "react-router";
import { SignUpPresenter } from "../../presenter/SignUpPresenter.ts";
import SignUp from "./SignUp.tsx";

function renderSignUp() {
  const mockPresenter = mock<SignUpPresenter>();
  render(
    <MemoryRouter>
      <SignUp presenter={instance(mockPresenter)} />
    </MemoryRouter>,
  );
  return { mockPresenter, user: userEvent.setup() };
}

describe("SignUp", () => {
  it("labels every field and explains the password rules", () => {
    renderSignUp();

    expect(screen.getByLabelText("Name")).toHaveAttribute("autocomplete", "name");
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(password).toHaveAccessibleDescription(/At least 8 characters/);
  });

  it("creates the account with the keyboard alone", async () => {
    const { mockPresenter, user } = renderSignUp();

    await user.tab();
    expect(screen.getByLabelText("Name")).toHaveFocus();
    await user.keyboard("Teacher C");
    await user.tab();
    await user.keyboard("teacher.c@example.com");
    await user.tab();
    await user.keyboard("Secret-password-1{Enter}");

    verify(mockPresenter.doSignUp("Teacher C", "teacher.c@example.com", "Secret-password-1")).once();
  });

  it("doesn't submit with an empty field", async () => {
    const { mockPresenter, user } = renderSignUp();

    await user.type(screen.getByLabelText("Email"), "teacher.c@example.com");
    await user.type(screen.getByLabelText("Password"), "Secret-password-1");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    verify(mockPresenter.doSignUp(anything(), anything(), anything())).never();
  });

  it("links back to sign in", () => {
    renderSignUp();

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
});
