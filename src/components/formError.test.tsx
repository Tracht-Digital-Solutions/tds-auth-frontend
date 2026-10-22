// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { stubMatchMedia } from "~/test-support/matchMedia";
import { ErrorPill, Field, useFormError } from "~/components/formError";

/**
 * Where a form error lands: a field error is a tip beside its first field on
 * the split layout and the pill above the form narrower; a field-less error is
 * always the pill. Exactly one `role="alert"` either way.
 */

let api: ReturnType<typeof useFormError>;

function Harness() {
  api = useFormError();
  return (
    <form>
      <ErrorPill message={api.pill} />
      <Field tip={api.tip("a")}>
        <label>
          A
          <input aria-invalid={api.invalid("a")} />
        </label>
      </Field>
      <Field tip={api.tip("b")}>
        <label>
          B
          <input aria-invalid={api.invalid("b")} />
        </label>
      </Field>
    </form>
  );
}

let media: ReturnType<typeof stubMatchMedia> | null = null;

afterEach(() => {
  cleanup();
  media?.restore();
  media = null;
});

const tipOf = () => document.querySelector(".auth-field__tip");
const pillOf = () => document.querySelector(".status-pill");

describe("on the split layout", () => {
  it("shows a field error as a tip beside the first field, not as a pill", () => {
    media = stubMatchMedia(true);
    render(<Harness />);
    act(() => api.setError("Falsch.", ["a", "b"]));

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(tipOf()?.textContent).toBe("Falsch.");
    expect(tipOf()?.closest(".auth-field")?.querySelector("input")).toBe(screen.getByLabelText("A"));
    expect(pillOf()).toBeNull();
    expect(screen.getByLabelText("A").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("B").getAttribute("aria-invalid")).toBe("true");
  });

  it("keeps the message out of the field's accessible name", () => {
    media = stubMatchMedia(true);
    render(<Harness />);
    act(() => api.setError("Falsch.", ["a"]));

    expect(tipOf()?.closest("label")).toBeNull();
  });

  it("keeps an error without fields in the pill", () => {
    media = stubMatchMedia(true);
    render(<Harness />);
    act(() => api.setError("Netzwerkfehler."));

    expect(pillOf()?.textContent).toBe("Netzwerkfehler.");
    expect(tipOf()).toBeNull();
    expect(screen.getByLabelText("A").getAttribute("aria-invalid")).toBeNull();
  });

  it("moves the message into the pill when the window narrows", () => {
    media = stubMatchMedia(true);
    render(<Harness />);
    act(() => api.setError("Falsch.", ["a"]));
    act(() => media!.set(false));

    expect(tipOf()).toBeNull();
    expect(pillOf()?.textContent).toBe("Falsch.");
  });
});

describe("narrower", () => {
  it("shows a field error in the pill and still marks the fields", () => {
    media = stubMatchMedia(false);
    render(<Harness />);
    act(() => api.setError("Falsch.", ["b"]));

    expect(pillOf()?.textContent).toBe("Falsch.");
    expect(tipOf()).toBeNull();
    expect(screen.getByLabelText("B").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("editing", () => {
  it("clears an error that names the edited field, and only that kind", () => {
    media = stubMatchMedia(true);
    render(<Harness />);
    act(() => api.setError("Netzwerkfehler."));
    act(() => api.edited("a"));
    expect(pillOf()).not.toBeNull();

    act(() => api.setError("Falsch.", ["a", "b"]));
    act(() => api.edited("b"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("A").getAttribute("aria-invalid")).toBeNull();
  });
});
