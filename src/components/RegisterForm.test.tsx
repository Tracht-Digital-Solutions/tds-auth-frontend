// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { stubLocation, type StubbedLocation } from "~/test-support/location";
import { TYPING_EVENT } from "~/lib/artworkSignal";

/**
 * The registration island (`/registrieren`). The invariants:
 *
 *  - the confirmation is ONE sentence for every address — the API hides
 *    whether an account exists, and the page must not undo that,
 *  - length and match are checked before the request,
 *  - an allowed `?next=` survives the trip through the mailbox; a foreign one
 *    is never stored or followed,
 *  - with `?token=` the page confirms on load and offers the sign-in.
 */

const { register, confirmRegistration } = vi.hoisted(() => ({
  register: vi.fn(),
  confirmRegistration: vi.fn(),
}));

vi.mock("~/lib/auth", () => ({ register, confirmRegistration }));

vi.mock("@tracht-digital-solutions/tds-shared/components", () => ({
  Spinner: ({ size }: { size?: string }) => <span data-testid="spinner" data-size={size} />,
}));

const { default: RegisterForm, NEXT_KEY } = await import("~/components/RegisterForm");

let loc: StubbedLocation;

beforeEach(() => {
  register.mockReset();
  confirmRegistration.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  loc.restore();
});

async function fill(password = "correct-horse-1", confirm = password) {
  await userEvent.type(screen.getByLabelText("Name"), "Erika");
  await userEvent.type(screen.getByLabelText("E-Mail"), "erika@example.de");
  await userEvent.type(screen.getByLabelText(/^Passwort \(mindestens/), password);
  await userEvent.type(screen.getByLabelText("Passwort bestätigen"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Konto anlegen" }));
}

describe("signing up", () => {
  it("confirms with the same neutral sentence after a 202", async () => {
    loc = stubLocation("https://auth.tracht-digital.de/registrieren");
    register.mockResolvedValueOnce({ ok: true, status: 202 });
    render(<RegisterForm />);

    await fill();

    expect(register).toHaveBeenCalledWith("Erika", "erika@example.de", "correct-horse-1");
    const status = (await screen.findByRole("status")).textContent ?? "";
    expect(status).toContain("Bestätigungslink");
    expect(status).toContain("Besteht zu der Adresse schon ein Konto");
  });

  it("checks length and match before calling the API", async () => {
    loc = stubLocation("https://auth.tracht-digital.de/registrieren");
    render(<RegisterForm />);

    await fill("short");
    expect((await screen.findByRole("alert")).textContent).toContain("mindestens 12 Zeichen");

    cleanup();
    render(<RegisterForm />);
    await fill("correct-horse-1", "correct-horse-2");
    expect((await screen.findByRole("alert")).textContent).toContain("stimmen nicht überein");
    expect(register).not.toHaveBeenCalled();
  });

  it("keeps an allowed next for after the confirmation, never a foreign one", () => {
    loc = stubLocation("https://auth.tracht-digital.de/registrieren?next=https%3A%2F%2Ftools.tracht-digital.de%2Fpremium");
    render(<RegisterForm />);
    expect(localStorage.getItem(NEXT_KEY)).toBe("https://tools.tracht-digital.de/premium");

    cleanup();
    loc.restore();
    localStorage.clear();
    loc = stubLocation("https://auth.tracht-digital.de/registrieren?next=https%3A%2F%2Fevil.example%2F");
    render(<RegisterForm />);
    expect(localStorage.getItem(NEXT_KEY)).toBeNull();
  });

  it("signals typing to the artwork", async () => {
    loc = stubLocation("https://auth.tracht-digital.de/registrieren");
    const seen = vi.fn();
    window.addEventListener(TYPING_EVENT, seen);
    render(<RegisterForm />);

    await userEvent.type(screen.getByLabelText("Name"), "a");

    expect(seen).toHaveBeenCalled();
    window.removeEventListener(TYPING_EVENT, seen);
  });
});

describe("confirming", () => {
  it("confirms on load and signs in towards the stored next", async () => {
    localStorage.setItem(NEXT_KEY, "https://tools.tracht-digital.de/premium");
    loc = stubLocation("https://auth.tracht-digital.de/registrieren?token=abc");
    confirmRegistration.mockResolvedValueOnce({ ok: true, status: 204 });
    render(<RegisterForm />);

    const link = await screen.findByRole("link", { name: "Jetzt anmelden" });
    expect(confirmRegistration).toHaveBeenCalledWith("abc");
    expect(link.getAttribute("href")).toBe("/?next=" + encodeURIComponent("https://tools.tracht-digital.de/premium"));
    expect(localStorage.getItem(NEXT_KEY)).toBeNull();
  });

  it("never follows a foreign stored next", async () => {
    localStorage.setItem(NEXT_KEY, "https://evil.example/");
    loc = stubLocation("https://auth.tracht-digital.de/registrieren?token=abc");
    confirmRegistration.mockResolvedValueOnce({ ok: true, status: 204 });
    render(<RegisterForm />);

    const link = await screen.findByRole("link", { name: "Jetzt anmelden" });
    expect(link.getAttribute("href")).toBe("/");
  });

  it("offers a new registration for a dead link", async () => {
    loc = stubLocation("https://auth.tracht-digital.de/registrieren?token=old");
    confirmRegistration.mockResolvedValueOnce({ ok: false, status: 400 });
    render(<RegisterForm />);

    expect((await screen.findByRole("alert")).textContent).toContain("ungültig, abgelaufen");
    expect(screen.getByRole("link", { name: "Erneut registrieren" }).getAttribute("href")).toBe("/registrieren");
  });
});
