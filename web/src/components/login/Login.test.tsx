import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { anything, instance, mock, verify } from "@typestrong/ts-mockito";
import { MemoryRouter } from "react-router";
import { LoginPresenter } from "../../presenter/LoginPresenter.ts";
import Login from "./Login.tsx";

function renderLogin(state?: unknown) {
  const mockPresenter = mock<LoginPresenter>();
  render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state }]}>
      <Login presenter={instance(mockPresenter)} />
    </MemoryRouter>,
  );
  return { mockPresenter, user: userEvent.setup() };
}

describe("Login", () => {
  it("labels every field", () => {
    renderLogin();

    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("signs in with the keyboard alone", async () => {
    const { mockPresenter, user } = renderLogin();

    await user.tab();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    await user.keyboard("teacher@example.com");
    await user.tab();
    expect(screen.getByLabelText("Password")).toHaveFocus();
    await user.keyboard("Secret-1{Enter}");

    verify(mockPresenter.doLogin("teacher@example.com", "Secret-1")).once();
  });

  it("signs in when the button is clicked", async () => {
    const { mockPresenter, user } = renderLogin();

    await user.type(screen.getByLabelText("Email"), "teacher@example.com");
    await user.type(screen.getByLabelText("Password"), "Secret-1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    verify(mockPresenter.doLogin("teacher@example.com", "Secret-1")).once();
  });

  it("doesn't submit with an empty field", async () => {
    const { mockPresenter, user } = renderLogin();

    await user.type(screen.getByLabelText("Email"), "teacher@example.com");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    verify(mockPresenter.doLogin(anything(), anything())).never();
  });
});

describe("Login, for people without an account", () => {
  it("links to the sign-up page", () => {
    renderLogin();

    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup");
  });

  it("fills in the email and shows the notice it was opened with", () => {
    renderLogin({ email: "teacher.c@example.com", notice: "Your email is verified." });

    expect(screen.getByLabelText("Email")).toHaveValue("teacher.c@example.com");
    expect(screen.getByRole("status")).toHaveTextContent("Your email is verified.");
  });

  it("shows no notice when opened directly", () => {
    renderLogin();

    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
