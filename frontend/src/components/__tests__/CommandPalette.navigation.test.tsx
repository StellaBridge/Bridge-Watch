import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/utils";
import CommandPalette from "../CommandPalette";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

const STORAGE_KEY = "bridgewatch:recent_actions";

function openWithShortcut() {
  fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
  return screen.getByRole("dialog", { name: "Command palette" });
}

function input() {
  return screen.getByRole("combobox");
}

function options() {
  return screen.getAllByRole("option");
}

function selectedOption() {
  return screen.getByRole("option", { selected: true });
}

describe("CommandPalette", () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView; the palette calls it on every selection change.
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    localStorage.clear();
    navigateMock.mockReset();
  });

  it("stays closed until opened with Ctrl+K", () => {
    render(<CommandPalette />);
    expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();

    openWithShortcut();

    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
  });

  it("opens with '/' when focus is not in a text field", () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document.body, { key: "/" });

    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
  });

  it("filters navigation commands by the typed search term", () => {
    render(<CommandPalette />);
    openWithShortcut();

    fireEvent.change(input(), { target: { value: "bridg" } });

    const titles = options().map((option) => option.textContent ?? "");
    expect(titles.some((title) => title.includes("Go to Bridges"))).toBe(true);
    expect(titles.some((title) => title.includes("Go to Analytics"))).toBe(false);
  });

  it("shows a no-results message when nothing matches", () => {
    render(<CommandPalette />);
    openWithShortcut();

    fireEvent.change(input(), { target: { value: "zzqqxx" } });

    expect(screen.getByText(/No results for/)).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("moves the selection down and up with the arrow keys", () => {
    render(<CommandPalette />);
    openWithShortcut();

    expect(selectedOption()).toHaveTextContent("Go to Dashboard");

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(selectedOption()).toHaveTextContent("Go to Bridges");

    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(selectedOption()).toHaveTextContent("Go to Dashboard");
  });

  it("does not move the selection above the first item", () => {
    render(<CommandPalette />);
    openWithShortcut();

    fireEvent.keyDown(input(), { key: "ArrowUp" });

    expect(selectedOption()).toHaveTextContent("Go to Dashboard");
  });

  it("does not move the selection past the last item", () => {
    render(<CommandPalette />);
    openWithShortcut();
    const last = options().length - 1;

    for (let i = 0; i < options().length + 3; i += 1) {
      fireEvent.keyDown(input(), { key: "ArrowDown" });
    }

    expect(options()[last]).toHaveAttribute("aria-selected", "true");
  });

  it("navigates to the selected route when Enter is pressed", () => {
    render(<CommandPalette />);
    openWithShortcut();

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(navigateMock).toHaveBeenCalledWith("/bridges");
    expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
  });

  it("runs the typed-and-selected command on Enter", () => {
    render(<CommandPalette />);
    openWithShortcut();

    fireEvent.change(input(), { target: { value: "status" } });
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(navigateMock).toHaveBeenCalledWith("/status");
  });

  it("closes without navigating when Escape is pressed", () => {
    render(<CommandPalette />);
    openWithShortcut();

    fireEvent.keyDown(input(), { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("lists the most recently used command first when reopened", () => {
    render(<CommandPalette />);
    openWithShortcut();
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });

    openWithShortcut();

    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(options()[0]).toHaveTextContent("Go to Bridges");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual(["nav-bridges"]);
  });
});
