import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { render } from "../../test/utils";
import BridgeNotesPanel from "../BridgeNotesPanel";
import type { BridgeNote } from "../../hooks/useBridgeNotes";

const STORAGE_KEY = "bridgewatch:bridge-notes";
const BRIDGE = "Allbridge";

function seed(notes: BridgeNote[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function note(overrides: Partial<BridgeNote> = {}): BridgeNote {
  const stamp = "2026-01-01T00:00:00.000Z";
  return {
    id: "note_1",
    bridgeName: BRIDGE,
    content: "Seeded note",
    author: "operator",
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

function composeBox() {
  return screen.getByRole("textbox", { name: "New bridge note" });
}

function addButton() {
  return screen.getByRole("button", { name: "Add note" });
}

describe("BridgeNotesPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("adds a note from the compose form and attributes it to the operator", () => {
    render(<BridgeNotesPanel bridgeName={BRIDGE} />);

    fireEvent.change(composeBox(), { target: { value: "Investigating reserve drift" } });
    fireEvent.click(addButton());

    expect(screen.getByText("Investigating reserve drift")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Note by operator" })).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as BridgeNote[];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ bridgeName: BRIDGE, content: "Investigating reserve drift" });
  });

  it("keeps the Add note button disabled for a blank note", () => {
    render(<BridgeNotesPanel bridgeName={BRIDGE} />);

    fireEvent.change(composeBox(), { target: { value: "    " } });

    expect(addButton()).toBeDisabled();
  });

  it("submits the note with Ctrl+Enter", () => {
    render(<BridgeNotesPanel bridgeName={BRIDGE} />);

    fireEvent.change(composeBox(), { target: { value: "Quick note" } });
    fireEvent.keyDown(composeBox(), { key: "Enter", ctrlKey: true });

    expect(screen.getByText("Quick note")).toBeInTheDocument();
  });

  it("renders **bold** and _italic_ markdown in the note body", () => {
    render(<BridgeNotesPanel bridgeName={BRIDGE} />);

    fireEvent.change(composeBox(), { target: { value: "**critical** and _watch_" } });
    fireEvent.click(addButton());

    const card = screen.getByRole("article", { name: "Note by operator" });
    expect(within(card).getByText("critical").tagName).toBe("STRONG");
    expect(within(card).getByText("watch").tagName).toBe("EM");
  });

  it("only shows notes that belong to the current bridge", () => {
    seed([
      note({ id: "a", bridgeName: BRIDGE, content: "Allbridge note" }),
      note({ id: "b", bridgeName: "Wormhole", content: "Wormhole note" }),
    ]);

    render(<BridgeNotesPanel bridgeName={BRIDGE} />);

    expect(screen.getByText("Allbridge note")).toBeInTheDocument();
    expect(screen.queryByText("Wormhole note")).toBeNull();
  });

  it("edits the operator's own note", () => {
    seed([note({ content: "Original text" })]);
    render(<BridgeNotesPanel bridgeName={BRIDGE} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit note content" }), {
      target: { value: "Updated text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Updated text")).toBeInTheDocument();
    expect(screen.queryByText("Original text")).toBeNull();
    expect(screen.getByText("(edited)")).toBeInTheDocument();
  });

  it("discards an in-progress edit on Cancel", () => {
    seed([note({ content: "Keep me" })]);
    render(<BridgeNotesPanel bridgeName={BRIDGE} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit note content" }), {
      target: { value: "Throw away" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Keep me")).toBeInTheDocument();
    expect(screen.queryByText("Throw away")).toBeNull();
  });

  it("deletes a note", () => {
    seed([note({ content: "Delete me" })]);
    render(<BridgeNotesPanel bridgeName={BRIDGE} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));

    expect(screen.queryByText("Delete me")).toBeNull();
    expect(screen.getByText("No notes yet")).toBeInTheDocument();
  });
});
