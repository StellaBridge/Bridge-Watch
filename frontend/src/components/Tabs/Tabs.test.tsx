import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Tab, TabList, TabPanel, Tabs } from "./Tabs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ControlledTabs({
  defaultTab = "a",
  orientation,
}: {
  defaultTab?: string;
  orientation?: "horizontal" | "vertical";
}) {
  const [active, setActive] = useState(defaultTab);
  return (
    <Tabs activeTab={active} onTabChange={setActive} orientation={orientation}>
      <TabList aria-label="Test tabs">
        <Tab id="a">Tab A</Tab>
        <Tab id="b">Tab B</Tab>
        <Tab id="c">Tab C</Tab>
      </TabList>
      <TabPanel id="a">Panel A</TabPanel>
      <TabPanel id="b">Panel B</TabPanel>
      <TabPanel id="c">Panel C</TabPanel>
    </Tabs>
  );
}

function TabsWithDisabled() {
  const [active, setActive] = useState("a");
  return (
    <Tabs activeTab={active} onTabChange={setActive}>
      <TabList aria-label="Tabs with disabled">
        <Tab id="a">Tab A</Tab>
        <Tab id="b" disabled>
          Tab B
        </Tab>
        <Tab id="c">Tab C</Tab>
      </TabList>
      <TabPanel id="a">Panel A</TabPanel>
      <TabPanel id="b">Panel B</TabPanel>
      <TabPanel id="c">Panel C</TabPanel>
    </Tabs>
  );
}

// ─── ARIA roles and attributes ────────────────────────────────────────────────

describe("ARIA roles and attributes", () => {
  it("renders a tablist with role=tablist", () => {
    render(<ControlledTabs />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("renders tabs with role=tab", () => {
    render(<ControlledTabs />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("renders panels with role=tabpanel", () => {
    render(<ControlledTabs />);
    // Only the active panel is rendered by default
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("sets aria-selected=true on the active tab", () => {
    render(<ControlledTabs defaultTab="b" />);
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("sets aria-selected=false on inactive tabs", () => {
    render(<ControlledTabs defaultTab="b" />);
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("links tab to panel via aria-controls / aria-labelledby", () => {
    render(<ControlledTabs defaultTab="a" />);
    const tab = screen.getByRole("tab", { name: "Tab A" });
    const panel = screen.getByRole("tabpanel");
    expect(tab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tab.id);
  });

  it("sets tabIndex=0 on active tab and -1 on others", () => {
    render(<ControlledTabs defaultTab="a" />);
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tab", { name: "Tab C" })).toHaveAttribute("tabindex", "-1");
  });

  it("applies aria-orientation=horizontal by default", () => {
    render(<ControlledTabs />);
    expect(screen.getByRole("tablist")).toHaveAttribute(
      "aria-orientation",
      "horizontal"
    );
  });

  it("applies aria-orientation=vertical when specified", () => {
    render(<ControlledTabs orientation="vertical" />);
    expect(screen.getByRole("tablist")).toHaveAttribute(
      "aria-orientation",
      "vertical"
    );
  });
});

// ─── Mouse interaction ────────────────────────────────────────────────────────

describe("Mouse interaction", () => {
  it("activates a tab on click", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs defaultTab="a" />);
    await act(async () => user.click(screen.getByRole("tab", { name: "Tab B" })));
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("Panel B")).toBeInTheDocument();
  });

  it("does not activate a disabled tab on click", async () => {
    const user = userEvent.setup();
    render(<TabsWithDisabled />);
    await act(async () => user.click(screen.getByRole("tab", { name: "Tab B" })));
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
    expect(screen.queryByText("Panel B")).not.toBeInTheDocument();
  });
});

// ─── Keyboard navigation (horizontal) ────────────────────────────────────────

describe("Keyboard navigation — horizontal", () => {
  it("moves focus to the next tab with ArrowRight", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs defaultTab="a" />);
    screen.getByRole("tab", { name: "Tab A" }).focus();
    await act(async () => user.keyboard("{ArrowRight}"));
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("Panel B")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("moves focus to the previous tab with ArrowLeft", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs defaultTab="b" />);
    screen.getByRole("tab", { name: "Tab B" }).focus();
    await act(async () => user.keyboard("{ArrowLeft}"));
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveFocus();
  });

  it("wraps from last to first with ArrowRight", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs defaultTab="c" />);
    screen.getByRole("tab", { name: "Tab C" }).focus();
    await act(async () => user.keyboard("{ArrowRight}"));
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveFocus();
  });

  it("wraps from first to last with ArrowLeft", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs defaultTab="a" />);
    screen.getByRole("tab", { name: "Tab A" }).focus();
    await act(async () => user.keyboard("{ArrowLeft}"));
    expect(screen.getByRole("tab", { name: "Tab C" })).toHaveFocus();
  });

  it("moves focus to the first tab with Home", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs defaultTab="c" />);
    screen.getByRole("tab", { name: "Tab C" }).focus();
    await act(async () => user.keyboard("{Home}"));
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveFocus();
  });

  it("moves focus to the last tab with End", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs defaultTab="a" />);
    screen.getByRole("tab", { name: "Tab A" }).focus();
    await act(async () => user.keyboard("{End}"));
    expect(screen.getByRole("tab", { name: "Tab C" })).toHaveFocus();
  });
});

// ─── Keyboard navigation (vertical) ──────────────────────────────────────────

describe("Keyboard navigation — vertical", () => {
  it("moves focus with ArrowDown", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs defaultTab="a" orientation="vertical" />);
    screen.getByRole("tab", { name: "Tab A" }).focus();
    await act(async () => user.keyboard("{ArrowDown}"));
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveFocus();
  });

  it("moves focus with ArrowUp", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs defaultTab="b" orientation="vertical" />);
    screen.getByRole("tab", { name: "Tab B" }).focus();
    await act(async () => user.keyboard("{ArrowUp}"));
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveFocus();
  });

  it("does not respond to ArrowLeft/Right in vertical mode", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs defaultTab="a" orientation="vertical" />);
    screen.getByRole("tab", { name: "Tab A" }).focus();
    await act(async () => user.keyboard("{ArrowRight}"));
    // Focus should not have moved
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveFocus();
  });
});

// ─── Disabled tab skipping ────────────────────────────────────────────────────

describe("Disabled tab skipping", () => {
  it("skips disabled tabs during ArrowRight navigation", async () => {
    const user = userEvent.setup();
    render(<TabsWithDisabled />);
    screen.getByRole("tab", { name: "Tab A" }).focus();
    await act(async () => user.keyboard("{ArrowRight}"));
    // Tab B is disabled — focus should land on Tab C
    expect(screen.getByRole("tab", { name: "Tab C" })).toHaveFocus();
  });

  it("skips disabled tabs during ArrowLeft navigation", async () => {
    const user = userEvent.setup();
    render(<TabsWithDisabled />);
    screen.getByRole("tab", { name: "Tab C" }).focus();
    await act(async () => user.keyboard("{ArrowLeft}"));
    // Tab B is disabled — focus should land on Tab A
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveFocus();
  });
});

// ─── Panel visibility ─────────────────────────────────────────────────────────

describe("Panel visibility", () => {
  it("shows only the active panel by default", () => {
    render(<ControlledTabs defaultTab="a" />);
    expect(screen.getByText("Panel A")).toBeInTheDocument();
    expect(screen.queryByText("Panel B")).not.toBeInTheDocument();
    expect(screen.queryByText("Panel C")).not.toBeInTheDocument();
  });

  it("shows the correct panel after tab change", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs defaultTab="a" />);
    await act(async () => user.click(screen.getByRole("tab", { name: "Tab C" })));
    expect(screen.queryByText("Panel A")).not.toBeInTheDocument();
    expect(screen.getByText("Panel C")).toBeInTheDocument();
  });

  it("keeps all panels mounted when keepMounted=true", () => {
    function KeepMountedTabs() {
      const [active, setActive] = useState("a");
      return (
        <Tabs activeTab={active} onTabChange={setActive}>
          <TabList aria-label="Keep mounted tabs">
            <Tab id="a">Tab A</Tab>
            <Tab id="b">Tab B</Tab>
          </TabList>
          <TabPanel id="a" keepMounted>
            Panel A
          </TabPanel>
          <TabPanel id="b" keepMounted>
            Panel B
          </TabPanel>
        </Tabs>
      );
    }
    render(<KeepMountedTabs />);
    // Both panels are in the DOM; only the active one is visible (hidden attribute)
    expect(screen.getByText("Panel A")).toBeInTheDocument();
    expect(screen.getByText("Panel B")).toBeInTheDocument();
    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    const hiddenPanel = panels.find((p) => p.hasAttribute("hidden"));
    expect(hiddenPanel).toBeInTheDocument();
  });
});
