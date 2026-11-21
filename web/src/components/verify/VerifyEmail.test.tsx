import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { anything, instance, mock, verify } from "@typestrong/ts-mockito";
import { MemoryRouter } from "react-router";
import { VerifyEmailPresenter } from "../../presenter/VerifyEmailPresenter.ts";
import VerifyEmail from "./VerifyEmail.tsx";

function renderVerify(state?: unknown) {
  const mockPresenter = mock<VerifyEmailPresenter>();
  render(
    <MemoryRouter initialEntries={[{ pathname: "/verify", state }]}>
      <VerifyEmail presenter={instance(mockPresenter)} />
    </MemoryRouter>,
  );
  return { mockPresenter, user: userEvent.setup() };
}

const fromSignUp = { email: "teacher.c@example.com", notice: "We emailed a code to teacher.c@example.com." };

describe("VerifyEmail", () => {
  it("fills in the email and says where the code went", () => {
    renderVerify(fromSignUp);

    expect(screen.getByLabelText("Email")).toHaveValue("teacher.c@example.com");
    expect(screen.getByRole("status")).toHaveTextContent("We emailed a code to teacher.c@example.com.");
    expect(screen.getByLabelText("Code")).toHaveAttribute("autocomplete", "one-time-code");
  });

  it("asks for the email too when opened directly", () => {
    renderVerify();

    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Enter your email and the code we emailed you.");
  });

  it("verifies with the code", async () => {
    const { mockPresenter, user } = renderVerify(fromSignUp);

    await user.type(screen.getByLabelText("Code"), "123456{Enter}");

    verify(mockPresenter.doVerify("teacher.c@example.com", "123456")).once();
  });

  it("doesn't submit without a code", async () => {
    const { mockPresenter, user } = renderVerify(fromSignUp);

    await user.click(screen.getByRole("button", { name: "Verify email" }));

    verify(mockPresenter.doVerify(anything(), anything())).never();
  });

  it("sends a new code to the email", async () => {
    const { mockPresenter, user } = renderVerify(fromSignUp);

    await user.click(screen.getByRole("button", { name: "send a new code" }));

    verify(mockPresenter.doResend("teacher.c@example.com")).once();
  });

  it("asks for the email before sending a new code", async () => {
    const { mockPresenter, user } = renderVerify();

    await user.click(screen.getByRole("button", { name: "send a new code" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email, then send a new code.");
    verify(mockPresenter.doResend(anything())).never();
  });
});
