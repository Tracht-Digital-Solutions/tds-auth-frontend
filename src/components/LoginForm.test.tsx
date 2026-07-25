// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { stubLocation, type StubbedLocation } from "~/test-support/location";

/**
 * Behaviour tests for the central login island.
 *
 * The auth client is mocked at the module boundary — these tests are about the
 * form's decisions (which screen, which message, where to redirect), not about
 * HTTP shapes; `auth.test.ts` covers those. The important invariants:
 *
 *  - on-mount SSO: an existing shared session must forward WITHOUT rendering
 *    the form (a user logged in on one panel never sees a login here),
 *  - `mustChangePassword` beats the redirect, from either the login response or
 *    the on-mount `/me`, and carries `?next=` through to `/passwort`,
 *  - a login 200 is re-confirmed against `/me` before navigating, so a blocked
 *    cookie becomes a message instead of a redirect loop,
 *  - the redirect target always goes through the `next` allow-list.
 */

const { fetchMe, login } = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
}));

vi.mock("~/lib/auth", () => ({ fetchMe, login }));

// The shared Spinner is a presentational island from tds-shared-pkg; stub it so
// the tests don't depend on that package's markup.
vi.mock("@tracht-digital-solutions/tds-shared/components", () => ({
  Spinner: ({ size }: { size?: string }) => <span data-testid="spinner" data-size={size} />,
}));

const { default: LoginForm } = await import("~/components/LoginForm");

const ADMIN_HOME = "https://management.tracht-digital.de";
const PORTAL_HOME = "https://app.tracht-digital.de";

const ADMIN = { userId: 1, email: "julian@tracht-digital.de", isAdmin: true };
const CUSTOMER = { userId: 2, email: "kunde@example.de", isAdmin: false };

let loc: StubbedLocation;

beforeEach(() => {
  loc = stubLocation();
  fetchMe.mockReset();
  login.mockReset();
});

afterEach(() => {
  cleanup();
  loc.restore();
});

/** Render and wait for the on-mount `/me` probe to settle. */
async function renderSettled() {
  render(<LoginForm />);
  await waitFor(() => expect(fetchMe).toHaveBeenCalled());
}

/** Render, wait for the SSO probe to miss, and return the filled-in form. */
async function renderForm() {
  fetchMe.mockResolvedValueOnce(null);
  render(<LoginForm />);
  return await screen.findByLabelText("E-Mail");
}

async function submitCredentials(email = "julian@tracht-digital.de", password = "hunter2hunter2") {
  // delay: null — no need to simulate human typing speed; it costs ~700ms/test.
  const user = userEvent.setup({ delay: null });
  await user.type(await screen.findByLabelText("E-Mail"), email);
  await user.type(screen.getByLabelText("Passwort"), password);
  await user.click(screen.getByRole("button", { name: "Anmelden" }));
}

describe("on-mount SSO probe", () => {
  it("shows a spinner instead of the form while probing", () => {
    fetchMe.mockReturnValue(new Promise(() => {})); // never settles
    render(<LoginForm />);

    expect(screen.getByTestId("spinner")).toBeDefined();
    // The form must not flash before we know whether a session exists.
    expect(screen.queryByLabelText("E-Mail")).toBeNull();
  });

  it("forwards an already-authenticated admin without rendering the form", async () => {
    fetchMe.mockResolvedValue(ADMIN);
    await renderSettled();

    await waitFor(() => expect(loc.target()).toBe(ADMIN_HOME));
    expect(screen.queryByLabelText("E-Mail")).toBeNull();
    expect(login).not.toHaveBeenCalled();
  });

  it("forwards an already-authenticated customer to the portal", async () => {
    fetchMe.mockResolvedValue(CUSTOMER);
    await renderSettled();

    await waitFor(() => expect(loc.target()).toBe(PORTAL_HOME));
  });

  it("honours ?next= for an existing session", async () => {
    loc.restore();
    loc = stubLocation(
      `https://auth.tracht-digital.de/?next=${encodeURIComponent(`${PORTAL_HOME}/tickets/12`)}`,
    );
    fetchMe.mockResolvedValue(CUSTOMER);
    await renderSettled();

    await waitFor(() => expect(loc.target()).toBe(`${PORTAL_HOME}/tickets/12`));
  });

  it("ignores a hostile ?next= and falls back to the role default", async () => {
    loc.restore();
    loc = stubLocation("https://auth.tracht-digital.de/?next=https%3A%2F%2Fevil.example%2Fsteal");
    fetchMe.mockResolvedValue(ADMIN);
    await renderSettled();

    await waitFor(() => expect(loc.target()).toBe(ADMIN_HOME));
  });

  it("routes an existing session flagged mustChangePassword to /passwort", async () => {
    fetchMe.mockResolvedValue({ ...ADMIN, mustChangePassword: true });
    await renderSettled();

    await waitFor(() => expect(loc.target()).toBe("/passwort"));
  });

  it("carries ?next= through to /passwort, re-encoded", async () => {
    const next = `${ADMIN_HOME}/users?tab=roles`;
    loc.restore();
    loc = stubLocation(`https://auth.tracht-digital.de/?next=${encodeURIComponent(next)}`);
    fetchMe.mockResolvedValue({ ...ADMIN, mustChangePassword: true });
    await renderSettled();

    await waitFor(() => expect(loc.target()).toBe(`/passwort?next=${encodeURIComponent(next)}`));
  });

  it("renders the form when there is no session", async () => {
    await renderForm();

    expect(screen.getByLabelText("Passwort")).toBeDefined();
    expect(screen.getByRole("button", { name: "Anmelden" })).toBeDefined();
    expect(loc.replace).not.toHaveBeenCalled();
  });

  it("renders the form when the probe fails (offline API)", async () => {
    // fetchMe swallows network errors and returns null — no dead-end spinner.
    fetchMe.mockResolvedValue(null);
    render(<LoginForm />);

    expect(await screen.findByLabelText("E-Mail")).toBeDefined();
  });

  it("does not act on a probe that resolves after unmount", async () => {
    let settle: (v: unknown) => void = () => {};
    fetchMe.mockReturnValue(new Promise((r) => (settle = r)));
    const { unmount } = render(<LoginForm />);
    unmount();
    settle(ADMIN);
    await Promise.resolve();

    expect(loc.replace).not.toHaveBeenCalled();
  });
});

describe("submitting credentials", () => {
  it("sends exactly what was typed", async () => {
    await renderForm();
    login.mockResolvedValue({ ok: true, status: 200, mustChangePassword: false });
    fetchMe.mockResolvedValue(ADMIN);

    await submitCredentials("julian@tracht-digital.de", "hunter2hunter2");

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith("julian@tracht-digital.de", "hunter2hunter2"),
    );
  });

  it("re-confirms the session via /me, then redirects", async () => {
    await renderForm();
    login.mockResolvedValue({ ok: true, status: 200, mustChangePassword: false });
    fetchMe.mockResolvedValue(ADMIN);

    await submitCredentials();

    await waitFor(() => expect(loc.target()).toBe(ADMIN_HOME));
    // once on mount, once to confirm the cookie stuck
    expect(fetchMe).toHaveBeenCalledTimes(2);
  });

  it("redirects to a valid ?next= after login", async () => {
    loc.restore();
    loc = stubLocation(
      `https://auth.tracht-digital.de/?next=${encodeURIComponent(`${ADMIN_HOME}/wiki`)}`,
    );
    await renderForm();
    login.mockResolvedValue({ ok: true, status: 200, mustChangePassword: false });
    fetchMe.mockResolvedValue(ADMIN);

    await submitCredentials();

    await waitFor(() => expect(loc.target()).toBe(`${ADMIN_HOME}/wiki`));
  });

  it("goes to /passwort when the login demands a change, skipping /me", async () => {
    await renderForm();
    login.mockResolvedValue({ ok: true, status: 200, mustChangePassword: true });

    await submitCredentials();

    await waitFor(() => expect(loc.target()).toBe("/passwort"));
    // Only the on-mount probe — no confirmation round-trip on this branch.
    expect(fetchMe).toHaveBeenCalledTimes(1);
  });

  it("shows a message when the cookie did not stick", async () => {
    await renderForm();
    login.mockResolvedValue({ ok: true, status: 200, mustChangePassword: false });
    fetchMe.mockResolvedValue(null); // confirmation probe fails

    await submitCredentials();

    expect(
      await screen.findByText("Sitzung konnte nicht bestätigt werden. Bitte erneut versuchen."),
    ).toBeDefined();
    // A redirect here would loop the user against the target panel's gate.
    expect(loc.replace).not.toHaveBeenCalled();
  });

  it("disables the button and swaps in a spinner while in flight", async () => {
    await renderForm();
    login.mockReturnValue(new Promise(() => {})); // never settles

    await submitCredentials();

    const button = screen.getByRole("button");
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByTestId("spinner").getAttribute("data-size")).toBe("sm");
  });
});

describe("login failures", () => {
  it.each([
    [401, "E-Mail oder Passwort ist falsch."],
    [403, "Dieses Konto ist deaktiviert."],
    [429, "Zu viele Versuche. Bitte später erneut versuchen."],
    [500, "Anmeldung fehlgeschlagen. Bitte erneut versuchen."],
    [400, "Anmeldung fehlgeschlagen. Bitte erneut versuchen."],
  ])("maps status %i to its message", async (status, message) => {
    await renderForm();
    login.mockResolvedValue({ ok: false, status, mustChangePassword: false });

    await submitCredentials();

    expect(await screen.findByText(message)).toBeDefined();
    expect(loc.replace).not.toHaveBeenCalled();
  });

  it("re-enables the button after a failure so the user can retry", async () => {
    await renderForm();
    login.mockResolvedValue({ ok: false, status: 401, mustChangePassword: false });

    await submitCredentials();

    await screen.findByText("E-Mail oder Passwort ist falsch.");
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a network message when the request throws", async () => {
    await renderForm();
    login.mockRejectedValue(new TypeError("Failed to fetch"));

    await submitCredentials();

    expect(await screen.findByText("Netzwerkfehler. Bitte erneut versuchen.")).toBeDefined();
  });

  it("clears a previous error on the next attempt", async () => {
    await renderForm();
    login.mockResolvedValueOnce({ ok: false, status: 401, mustChangePassword: false });
    await submitCredentials();
    await screen.findByText("E-Mail oder Passwort ist falsch.");

    login.mockReturnValue(new Promise(() => {}));
    await userEvent.setup({ delay: null }).click(screen.getByRole("button"));

    await waitFor(() => expect(screen.queryByText("E-Mail oder Passwort ist falsch.")).toBeNull());
  });
});

describe("form markup", () => {
  it("uses autocomplete hints password managers understand", async () => {
    await renderForm();

    expect(screen.getByLabelText("E-Mail").getAttribute("autocomplete")).toBe("username");
    expect(screen.getByLabelText("Passwort").getAttribute("autocomplete")).toBe(
      "current-password",
    );
  });

  it("marks both fields required and the password field masked", async () => {
    await renderForm();

    const email = screen.getByLabelText("E-Mail") as HTMLInputElement;
    const password = screen.getByLabelText("Passwort") as HTMLInputElement;
    expect(email.type).toBe("email");
    expect(email.required).toBe(true);
    expect(password.type).toBe("password");
    expect(password.required).toBe(true);
  });
});
