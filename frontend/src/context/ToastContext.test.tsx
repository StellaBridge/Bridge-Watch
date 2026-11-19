import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider } from "./ToastContext";
import { useToast, type ToastItem } from "./ToastContextValue";
import { MAX_VISIBLE_TOASTS, dismissToast, enqueueToast } from "./toastQueue";

function toast(id: string, message = id, variant: ToastItem["variant"] = "info"): ToastItem {
  return { id, message, variant, count: 1, revision: 0 };
}

describe("toastQueue", () => {
  const empty = { visible: [], queued: [] };

  it("shows up to MAX_VISIBLE_TOASTS and queues the rest", () => {
    let state = empty;
    for (let i = 0; i < 5; i++) state = enqueueToast(state, toast(`t${i}`));

    expect(state.visible.map((t) => t.id)).toEqual(["t0", "t1", "t2"]);
    expect(state.queued.map((t) => t.id)).toEqual(["t3", "t4"]);
  });

  it("promotes the oldest queued toast when a visible one is dismissed", () => {
    let state = empty;
    for (let i = 0; i < 4; i++) state = enqueueToast(state, toast(`t${i}`));

    state = dismissToast(state, "t1");

    expect(state.visible.map((t) => t.id)).toEqual(["t0", "t2", "t3"]);
    expect(state.queued).toHaveLength(0);
  });

  it("merges duplicates into one toast with an incremented count", () => {
    let state = empty;
    state = enqueueToast(state, toast("a", "Connection failed", "error"));
    state = enqueueToast(state, toast("b", "Connection failed", "error"));
    state = enqueueToast(state, toast("c", "Connection failed", "error"));

    expect(state.visible).toHaveLength(1);
    expect(state.visible[0]).toMatchObject({ id: "a", count: 3, revision: 2 });
  });

  it("merges duplicates of a queued toast without promoting it", () => {
    let state = empty;
    for (let i = 0; i < 4; i++) state = enqueueToast(state, toast(`t${i}`));
    state = enqueueToast(state, toast("dup", "t3"));

    expect(state.visible).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(state.queued).toEqual([expect.objectContaining({ id: "t3", count: 2 })]);
  });

  it("does not merge identical messages with different variants", () => {
    let state = empty;
    state = enqueueToast(state, toast("a", "Saved", "info"));
    state = enqueueToast(state, toast("b", "Saved", "success"));

    expect(state.visible).toHaveLength(2);
  });

  it("puts critical toasts at the top and pushes the overflow back to the queue", () => {
    let state = empty;
    for (let i = 0; i < 4; i++) state = enqueueToast(state, toast(`t${i}`));
    state = enqueueToast(state, toast("crit", "Breach", "critical"));

    expect(state.visible.map((t) => t.id)).toEqual(["crit", "t0", "t1"]);
    expect(state.queued.map((t) => t.id)).toEqual(["t2", "t3"]);
  });
});

function Harness() {
  const { showToast, showError, showCritical } = useToast();
  return (
    <div>
      <button onClick={() => showToast({ message: `Info ${Math.random()}` })}>
        unique
      </button>
      <button onClick={() => showError("Connection failed")}>error</button>
      <button onClick={() => showCritical("Security alert")}>critical</button>
      <button onClick={() => showToast({ message: "Escalated", severity: "high" })}>
        high
      </button>
    </div>
  );
}

function renderHarness() {
  return render(
    <ToastProvider>
      <Harness />
    </ToastProvider>
  );
}

function click(name: string, times = 1) {
  for (let i = 0; i < times; i++) {
    fireEvent.click(screen.getByRole("button", { name }));
  }
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders at most three toasts at once", () => {
    renderHarness();
    click("unique", 5);

    expect(screen.getAllByRole("status")).toHaveLength(3);
  });

  it("shows queued toasts as visible ones are dismissed", () => {
    renderHarness();
    click("unique", 4);

    const before = screen.getAllByRole("status").map((el) => el.textContent);
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);
    const after = screen.getAllByRole("status").map((el) => el.textContent);

    expect(after).toHaveLength(3);
    expect(after).not.toContain(before[0]);
  });

  it("starts the countdown for a queued toast only once it becomes visible", () => {
    renderHarness();
    click("unique", 4);

    advance(6000);
    expect(screen.getAllByRole("status")).toHaveLength(1);

    advance(6000);
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("groups duplicate errors with a counter", () => {
    renderHarness();
    click("error", 3);

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("Connection failed (x3)");
  });

  it("restarts the auto-dismiss timer when a duplicate arrives", () => {
    renderHarness();
    click("error");
    advance(4000);
    click("error");
    advance(4000);

    expect(screen.getByRole("alert")).toBeInTheDocument();

    advance(2000);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows critical alerts immediately even when the viewport is full", () => {
    renderHarness();
    click("unique", 3);
    click("critical");

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("Security alert");
    expect(alerts[0]).toHaveAttribute("aria-live", "assertive");
    expect(alerts[0]).toHaveAttribute("data-variant", "critical");
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });

  it("treats severity: high as critical", () => {
    renderHarness();
    click("high");

    expect(screen.getByRole("alert")).toHaveAttribute("data-variant", "critical");
  });

  it("keeps critical alerts on screen longer than regular toasts", () => {
    renderHarness();
    click("critical");

    advance(6000);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    advance(2000);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("removes a toast when its dismiss button is clicked", () => {
    renderHarness();
    click("unique");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clears pending timers on unmount", () => {
    const clearSpy = vi.spyOn(window, "clearTimeout");
    const { unmount } = renderHarness();
    click("unique", 2);
    unmount();

    expect(clearSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    clearSpy.mockRestore();
  });
});
