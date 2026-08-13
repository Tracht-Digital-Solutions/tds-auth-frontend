// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { stubLocation, type StubbedLocation } from "~/test-support/location";
import { TYPING_EVENT } from "~/lib/artworkSignal";

/**
 * Behaviour tests for the password-change island (voluntary via `/passwort`, or
 * forced when the account carries `mustChangePassword`). The auth client is
 * mocked at the module boundary; `auth.test.ts` covers the HTTP shapes.
 *
 * The invariants that matter:
 *
 *  - the screen requires a session: no `/me` → bounce to the login, carrying
 *    `?next=` so the user still lands where they were headed,
 *  - client-side validation (length / match / differs-from-old) short-circuits
 *    BEFORE the request, so the API never sees a doomed call,
 *  - on success the redirect goes through the same `next` allow-list.
 */

const { fetchMe, changePassword } = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock("~/lib/auth", () => ({ fetchMe, changePassword }));

vi.mock("@tracht-digital-solutions/tds-shared/components", () => ({
  Spinner: ({ size }: { size?: string }) => <span data-testid="spinner" data-size={size} />,
}));

const { default: PasswordChangeForm } = await import("~/components/PasswordChangeForm");

const ADMIN_HOME = "https://management.tracht-digital.de";
const PORTAL_HOME = "https://app.tracht-digital.de";

const ADMIN = { userId: 1, email: "julian@tracht-digital.de", isAdmin: true };
const CUSTOMER = { userId: 2, email: "kunde@example.de", isAdmin: false };

const OLD_PW = "altespasswort1";
const NEW_PW = "neuespasswort1"; // 14 chars — over the 12-char minimum

let loc: StubbedLocation;

beforeEach(() => {
  loc = stubLocation("https://auth.tracht-digital.de/passwort");
  fetchMe.mockReset();
  changePassword.mockReset();
});

afterEach(() => {
  cleanup();
  loc.restore();
});

/** Render with a valid session and wait for the form to appear. */
async function renderForm() {
  fetchMe.mockResolvedValueOnce(ADMIN);
  render(<PasswordChangeForm />);
  await screen.findByLabelText("Aktuelles Passwort");
}

async function fillAndSubmit(oldPw = OLD_PW, newPw = NEW_PW, confirmPw = newPw) {
  const user = userEvent.setup({ delay: null });
  if (oldPw) await user.type(screen.getByLabelText("Aktuelles Passwort"), oldPw);
  if (newPw) await user.type(screen.getByLabelText("Neues Passwort"), newPw);
  if (confirmPw) await user.type(screen.getByLabelText("Neues Passwort bestätigen"), confirmPw);
  await user.click(screen.getByRole("button", { name: "Passwort speichern" }));
}

describe("session guard", () => {
  it("shows a spinner while checking, not the form", () => {
    fetchMe.mockReturnValue(new Promise(() => {}));
    render(<PasswordChangeForm />);

    expect(screen.getByTestId("spinner")).toBeDefined();
    expect(screen.queryByLabelText("Aktuelles Passwort")).toBeNull();
  });

  it("bounces to the login when there is no session", async () => {
    fetchMe.mockResolvedValue(null);
    render(<PasswordChangeForm />);

    await waitFor(() => expect(loc.target()).toBe("/"));
    expect(screen.queryByLabelText("Aktuelles Passwort")).toBeNull();
  });

  it("carries ?next= back to the login on the bounce", async () => {
    const next = `${ADMIN_HOME}/users`;
    loc.restore();
    loc = stubLocation(`https://auth.tracht-digital.de/passwort?next=${encodeURIComponent(next)}`);
    fetchMe.mockResolvedValue(null);
    render(<PasswordChangeForm />);

    await waitFor(() => expect(loc.target()).toBe(`/?next=${encodeURIComponent(next)}`));
  });

  it("renders the form when a session exists", async () => {
    await renderForm();

    expect(screen.getByLabelText("Neues Passwort")).toBeDefined();
    expect(screen.getByLabelText("Neues Passwort bestätigen")).toBeDefined();
    expect(loc.replace).not.toHaveBeenCalled();
  });

  it("does not act on a probe that resolves after unmount", async () => {
    let settle: (v: unknown) => void = () => {};
    fetchMe.mockReturnValue(new Promise((r) => (settle = r)));
    const { unmount } = render(<PasswordChangeForm />);
    unmount();
    settle(null);
    await Promise.resolve();

    expect(loc.replace).not.toHaveBeenCalled();
  });
});

describe("the artwork signal", () => {
  it("emits one signal per keystroke in all three fields", async () => {
    // Same contract as the login form: the artwork is a separate island and
    // this event is the only thing connecting them. A form that forgets it just
    // leaves the composition inert — nothing throws, nothing logs.
    const seen = vi.fn();
    window.addEventListener(TYPING_EVENT, seen);
    await renderForm();
    const user = userEvent.setup({ delay: null });

    await user.type(screen.getByLabelText("Aktuelles Passwort"), "ab");
    await user.type(screen.getByLabelText("Neues Passwort"), "cd");
    await user.type(screen.getByLabelText("Neues Passwort bestätigen"), "ef");
    window.removeEventListener(TYPING_EVENT, seen);

    expect(seen).toHaveBeenCalledTimes(6);
  });
});

describe("client-side validation", () => {
  it("rejects a new password under 12 characters without calling the API", async () => {
    await renderForm();

    await fillAndSubmit(OLD_PW, "kurz1234", "kurz1234");

    expect(
      await screen.findByText("Das neue Passwort muss mindestens 12 Zeichen lang sein."),
    ).toBeDefined();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("accepts exactly 12 characters (boundary)", async () => {
    await renderForm();
    changePassword.mockResolvedValue({ ok: true, status: 204 });
    fetchMe.mockResolvedValue(ADMIN);

    await fillAndSubmit(OLD_PW, "zwoelfzeich1", "zwoelfzeich1");

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith(OLD_PW, "zwoelfzeich1"));
  });

  it("rejects a mismatched confirmation", async () => {
    await renderForm();

    await fillAndSubmit(OLD_PW, NEW_PW, "einanderespasswort");

    expect(await screen.findByText("Die Passwörter stimmen nicht überein.")).toBeDefined();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("rejects reusing the current password", async () => {
    await renderForm();

    await fillAndSubmit(OLD_PW, OLD_PW, OLD_PW);

    expect(
      await screen.findByText("Das neue Passwort muss sich vom alten unterscheiden."),
    ).toBeDefined();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("checks length before the match (the more specific message wins)", async () => {
    await renderForm();

    await fillAndSubmit(OLD_PW, "kurz", "anders");

    expect(
      await screen.findByText("Das neue Passwort muss mindestens 12 Zeichen lang sein."),
    ).toBeDefined();
  });

  it("leaves the button usable after a validation rejection", async () => {
    await renderForm();

    await fillAndSubmit(OLD_PW, "kurz1234", "kurz1234");

    await screen.findByText("Das neue Passwort muss mindestens 12 Zeichen lang sein.");
    // busy was never set — the user can correct and resubmit immediately.
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("saving", () => {
  it("sends {old, new} and redirects to the role default", async () => {
    await renderForm();
    changePassword.mockResolvedValue({ ok: true, status: 204 });
    fetchMe.mockResolvedValue(ADMIN);

    await fillAndSubmit();

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith(OLD_PW, NEW_PW));
    await waitFor(() => expect(loc.target()).toBe(ADMIN_HOME));
  });

  it("re-reads /me after the rotation so the target matches the real role", async () => {
    await renderForm();
    changePassword.mockResolvedValue({ ok: true, status: 204 });
    fetchMe.mockResolvedValue(CUSTOMER);

    await fillAndSubmit();

    await waitFor(() => expect(loc.target()).toBe(PORTAL_HOME));
  });

  it("redirects to a valid ?next= after the change", async () => {
    const next = `${ADMIN_HOME}/wiki`;
    loc.restore();
    loc = stubLocation(`https://auth.tracht-digital.de/passwort?next=${encodeURIComponent(next)}`);
    await renderForm();
    changePassword.mockResolvedValue({ ok: true, status: 204 });
    fetchMe.mockResolvedValue(ADMIN);

    await fillAndSubmit();

    await waitFor(() => expect(loc.target()).toBe(next));
  });

  it("ignores a hostile ?next= after the change", async () => {
    loc.restore();
    loc = stubLocation(
      "https://auth.tracht-digital.de/passwort?next=https%3A%2F%2Fevil.example%2Fsteal",
    );
    await renderForm();
    changePassword.mockResolvedValue({ ok: true, status: 204 });
    fetchMe.mockResolvedValue(ADMIN);

    await fillAndSubmit();

    await waitFor(() => expect(loc.target()).toBe(ADMIN_HOME));
  });

  it("still redirects when the post-change /me comes back empty", async () => {
    // The session was just rotated; a failed probe must not strand the user.
    await renderForm();
    changePassword.mockResolvedValue({ ok: true, status: 204 });
    fetchMe.mockResolvedValue(null);

    await fillAndSubmit();

    await waitFor(() => expect(loc.target()).toBe(PORTAL_HOME));
  });

  it("disables the button and shows a spinner while saving", async () => {
    await renderForm();
    changePassword.mockReturnValue(new Promise(() => {}));

    await fillAndSubmit();

    await waitFor(() => expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByTestId("spinner").getAttribute("data-size")).toBe("sm");
  });
});

describe("save failures", () => {
  it("maps 401 to a wrong-current-password message", async () => {
    await renderForm();
    changePassword.mockResolvedValue({ ok: false, status: 401 });

    await fillAndSubmit();

    expect(await screen.findByText("Das aktuelle Passwort ist falsch.")).toBeDefined();
    expect(loc.replace).not.toHaveBeenCalled();
  });

  it("shows the API's own message on a 422", async () => {
    await renderForm();
    changePassword.mockResolvedValue({
      ok: false,
      status: 422,
      error: "Passwort steht auf der Sperrliste.",
    });

    await fillAndSubmit();

    expect(await screen.findByText("Passwort steht auf der Sperrliste.")).toBeDefined();
  });

  it("falls back to a generic message on a 422 with no error text", async () => {
    await renderForm();
    changePassword.mockResolvedValue({ ok: false, status: 422 });

    await fillAndSubmit();

    expect(await screen.findByText("Das neue Passwort ist ungültig.")).toBeDefined();
  });

  it("maps any other status to a generic failure", async () => {
    await renderForm();
    changePassword.mockResolvedValue({ ok: false, status: 500 });

    await fillAndSubmit();

    expect(await screen.findByText("Änderung fehlgeschlagen. Bitte erneut versuchen.")).toBeDefined();
  });

  it("shows a network message when the request throws", async () => {
    await renderForm();
    changePassword.mockRejectedValue(new TypeError("Failed to fetch"));

    await fillAndSubmit();

    expect(await screen.findByText("Netzwerkfehler. Bitte erneut versuchen.")).toBeDefined();
  });

  it("re-enables the button after a failure", async () => {
    await renderForm();
    changePassword.mockResolvedValue({ ok: false, status: 401 });

    await fillAndSubmit();

    await screen.findByText("Das aktuelle Passwort ist falsch.");
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("form markup", () => {
  it("uses new-password autocomplete on both new fields", async () => {
    await renderForm();

    expect(screen.getByLabelText("Aktuelles Passwort").getAttribute("autocomplete")).toBe(
      "current-password",
    );
    expect(screen.getByLabelText("Neues Passwort").getAttribute("autocomplete")).toBe(
      "new-password",
    );
    expect(screen.getByLabelText("Neues Passwort bestätigen").getAttribute("autocomplete")).toBe(
      "new-password",
    );
  });

  it("mirrors the 12-char minimum into the markup", async () => {
    await renderForm();

    const newPw = screen.getByLabelText("Neues Passwort") as HTMLInputElement;
    const confirm = screen.getByLabelText("Neues Passwort bestätigen") as HTMLInputElement;
    expect(newPw.minLength).toBe(12);
    expect(confirm.minLength).toBe(12);
    expect(newPw.type).toBe("password");
    expect(newPw.required).toBe(true);
  });
});
