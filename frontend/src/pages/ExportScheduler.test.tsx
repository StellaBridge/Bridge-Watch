import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { render } from "../test/utils";
import ExportScheduler from "./ExportScheduler";
import { useExportSchedulerStore } from "../stores/exportSchedulerStore";

beforeEach(() => useExportSchedulerStore.setState({ schedules: [] }));

describe("ExportScheduler", () => {
  it("opens the form, validates the name, and creates a schedule", () => {
    render(<ExportScheduler />);
    fireEvent.click(screen.getByRole("button", { name: "+ New Schedule" }));
    expect(screen.getByRole("form", { name: "Create export schedule" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create Schedule" }));
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Schedule Name"), { target: { value: "Daily analytics" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Schedule" }));
    expect(screen.getByText("Daily analytics")).toBeInTheDocument();
    expect(screen.getByText(/1 schedule/)).toBeInTheDocument();
  });

  it("switches to the calendar view", () => {
    render(<ExportScheduler />);
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.getByRole("group", { name: "View mode" })).toBeInTheDocument();
    expect(screen.getByText("No active schedules to display.")).toBeInTheDocument();
  });
});
