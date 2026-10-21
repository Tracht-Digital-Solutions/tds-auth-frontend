// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { stubLocation, type StubbedLocation } from "~/test-support/location";
import { TYPING_EVENT } from "~/lib/artworkSignal";

/**
 * The forgotten-password island (`/passwort-vergessen`). The invariants:
 *
 *  - the request confirmation is ONE sentence for every address — the API
 *    hides whether an account exists, and the page must not undo that,
 *  - with `?token=` the page sets a password; length and match are checked
 *    before the request, so a doomed call never burns a round trip,
 *  - a used or expired link offers a new one instead of a dead form.
 */

const { requestPasswordReset, confirmPasswordReset } = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));

vi.mock("~/lib/auth", () => ({ requestPasswordReset, confirmPasswordReset }));

vi.mock("@tracht-digital-solutions/tds-shared/components", () => ({
  Spinner: ({ size }: { size?: string }) => <span data-testid="spinner" data-size={size} />,
}));

const { default: PasswordResetForm } = await import("~/components/PasswordResetForm");

let loc: StubbedLocation;

beforeEach(() => {
  requestPasswordReset.mockReset();
  confirmPasswordReset.mockReset();
});

afterEach(() => {
  cleanup();
  loc.restore();
});

describe("requesting a link", () => {
  beforeEach(() => {
    loc = stubLocation("https://auth.tracht-digital.de/passwort-vergessen");
  });

  it("confirms with the same neutral sentence after a 202", async () => {
    requestPasswordReset.mockResolvedValueOnce({ ok: true, status: 202 });
    render(<PasswordResetForm />);

    await userEvent.type(screen.getByLabelText("E-Mail"), "kunde@example.de");
    await userEvent.click(screen.getByRole("button", { name: "Link anfordern" }));

    expect(requestPasswordReset).toHaveBeenCalledWith("kunde@example.de");
    expect((await screen.findByRole("status")).textContent).toContain("Wenn zu dieser Adresse ein Konto besteht");
  });

  it("reports the rate limit", async () => {
    requestPasswordReset.mockResolvedValueOnce({ ok: false, status: 429 });
    render(<PasswordResetForm />);

    await userEvent.type(screen.getByLabelText("E-Mail"), "kunde@example.de");
    await userEvent.click(screen.getByRole("button", { name: "Link anfordern" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Zu viele Anfragen");
  });

  it("signals typing to the artwork", async () => {
    const seen = vi.fn();
    window.addEventListener(TYPING_EVENT, seen);
    render(<PasswordResetForm />);

    await userEvent.type(screen.getByLabelText("E-Mail"), "a");

    expect(seen).toHaveBeenCalled();
    window.removeEventListener(TYPING_EVENT, seen);
  });
});

describe("setting a new password from the link", () => {
  beforeEach(() => {
    loc = stubLocation("https://auth.tracht-digital.de/passwort-vergessen?token=abc123");
  });

  it("checks length and match before calling the API", async () => {
    render(<PasswordResetForm />);

    await userEvent.type(screen.getByLabelText("Neues Passwort"), "kurz");
    await userEvent.type(screen.getByLabelText("Neues Passwort bestätigen"), "kurz");
    await userEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));

    expect((await screen.findByRole("alert")).textContent).toContain("mindestens 12 Zeichen");
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("sends token and password and then points to the login", async () => {
    confirmPasswordReset.mockResolvedValueOnce({ ok: true, status: 204 });
    render(<PasswordResetForm />);

    await userEvent.type(screen.getByLabelText("Neues Passwort"), "neuespasswort1");
    await userEvent.type(screen.getByLabelText("Neues Passwort bestätigen"), "neuespasswort1");
    await userEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));

    expect(confirmPasswordReset).toHaveBeenCalledWith("abc123", "neuespasswort1");
    expect((await screen.findByRole("link", { name: "Jetzt anmelden" })).getAttribute("href")).toBe("/");
  });

  it("offers a new link when the token is used or expired", async () => {
    confirmPasswordReset.mockResolvedValueOnce({ ok: false, status: 400 });
    render(<PasswordResetForm />);

    await userEvent.type(screen.getByLabelText("Neues Passwort"), "neuespasswort1");
    await userEvent.type(screen.getByLabelText("Neues Passwort bestätigen"), "neuespasswort1");
    await userEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));

    expect((await screen.findByRole("link", { name: "Neuen Link anfordern" })).getAttribute("href")).toBe(
      "/passwort-vergessen",
    );
  });
});
