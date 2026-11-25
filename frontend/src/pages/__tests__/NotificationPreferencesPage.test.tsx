import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import NotificationPreferencesPage from "../NotificationPreferencesPage";
import { NotificationProvider } from "../../context/NotificationContext";
import { ToastProvider } from "../../context/ToastContext";

// The analytics panel fetches its own data and has its own tests.
vi.mock("../../components/NotificationAnalyticsDashboard", () => ({
  NotificationAnalyticsDashboard: () => <div data-testid="notification-analytics" />,
}));

const EXTENDED_KEY = "bridge-watch:notification-extended-prefs:v1";
const SOUND_KEY = "notification-prefs";

function renderPage() {
  return render(
    <ToastProvider>
      <NotificationProvider>
        <NotificationPreferencesPage />
      </NotificationProvider>
    </ToastProvider>
  );
}

function saved() {
  return JSON.parse(localStorage.getItem(EXTENDED_KEY) ?? "null");
}

const toggle = (label: string) => screen.getByRole("switch", { name: label });

function successToasts() {
  return screen
    .queryAllByRole("status")
    .filter((el) => el.getAttribute("data-variant") === "success");
}

beforeEach(() => {
  localStorage.clear();
});

describe("NotificationPreferencesPage (#1684)", () => {
  it("renders defaults: in-app only, immediate delivery, all severities, quiet hours off", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Notification Preferences" })).toBeInTheDocument();
    expect(toggle("Toggle In-app channel")).toHaveAttribute("aria-checked", "true");
    expect(toggle("Toggle Email channel")).toHaveAttribute("aria-checked", "false");
    expect(toggle("Toggle Webhook channel")).toHaveAttribute("aria-checked", "false");
    expect(toggle("Toggle notification sounds")).toHaveAttribute("aria-checked", "true");
    expect(toggle("Toggle quiet hours")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: /All severities/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Immediate" })).toHaveClass("bg-stellar-blue");
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
    expect(screen.getByTestId("notification-analytics")).toBeInTheDocument();
  });

  describe("severity subscriptions", () => {
    it.each([
      [/^High & Critical only/, "high_critical"],
      [/^Critical only/, "critical_only"],
    ])("selecting %s persists the severity threshold", (name, value) => {
      renderPage();
      const radio = screen.getByRole("radio", { name });
      expect(radio).toHaveAttribute("value", value);
      fireEvent.click(radio);

      expect(radio).toBeChecked();
      expect(screen.getByRole("radio", { name: /All severities/ })).not.toBeChecked();
      expect(saved().priority).toBe(value);
    });

    it("keeps exactly one severity option selected", () => {
      renderPage();
      fireEvent.click(screen.getByRole("radio", { name: /^Critical only/ }));
      fireEvent.click(screen.getByRole("radio", { name: /All severities/ }));

      expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
      expect(saved().priority).toBe("all");
    });
  });

  describe("delivery channel toggles", () => {
    it("turns channels on and off and keeps the switch state in sync with what is saved", () => {
      renderPage();

      fireEvent.click(toggle("Toggle Webhook channel"));
      expect(toggle("Toggle Webhook channel")).toHaveAttribute("aria-checked", "true");
      expect(saved().channels).toEqual(["in_app", "webhook"]);

      fireEvent.click(toggle("Toggle Email channel"));
      fireEvent.click(toggle("Toggle In-app channel"));
      expect(toggle("Toggle In-app channel")).toHaveAttribute("aria-checked", "false");
      expect(saved().channels).toEqual(["webhook", "email"]);

      fireEvent.click(toggle("Toggle Webhook channel"));
      expect(saved().channels).toEqual(["email"]);
    });

    it("refuses to turn off the last active channel, so alerts can never be silently dropped", () => {
      renderPage();

      fireEvent.click(toggle("Toggle In-app channel"));

      expect(toggle("Toggle In-app channel")).toHaveAttribute("aria-checked", "true");
      expect(localStorage.getItem(EXTENDED_KEY)).toBeNull();
      expect(successToasts()).toHaveLength(0);
    });
  });

  it("toggles notification sounds through the notification context", () => {
    renderPage();

    fireEvent.click(toggle("Toggle notification sounds"));

    expect(toggle("Toggle notification sounds")).toHaveAttribute("aria-checked", "false");
    expect(JSON.parse(localStorage.getItem(SOUND_KEY)!)).toEqual({ soundEnabled: false });
    expect(successToasts()).toHaveLength(1);
  });

  it("switches digest frequency to a single selected option", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Daily digest" }));

    expect(screen.getByRole("button", { name: "Daily digest" })).toHaveClass("bg-stellar-blue");
    expect(screen.getByRole("button", { name: "Immediate" })).not.toHaveClass("bg-stellar-blue");
    expect(saved().digestFrequency).toBe("daily");
  });

  it("reveals quiet-hour times when enabled and saves edits to them", () => {
    renderPage();

    fireEvent.click(toggle("Toggle quiet hours"));
    const from = screen.getByLabelText("From");
    const until = screen.getByLabelText("Until");
    expect(from).toHaveValue("22:00");
    expect(until).toHaveValue("07:00");

    fireEvent.change(from, { target: { value: "23:30" } });
    fireEvent.change(until, { target: { value: "06:15" } });

    expect(saved()).toMatchObject({ quietHoursEnabled: true, quietHoursStart: "23:30", quietHoursEnd: "06:15" });

    fireEvent.click(toggle("Toggle quiet hours"));
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
    expect(saved().quietHoursEnabled).toBe(false);
  });

  it("saves every change immediately and confirms it with a success toast", () => {
    renderPage();

    fireEvent.click(toggle("Toggle Email channel"));

    const toasts = successToasts();
    expect(toasts).toHaveLength(1);
    expect(within(toasts[0]).getByText("Preference saved.")).toBeInTheDocument();
    expect(saved()).toEqual({
      channels: ["in_app", "email"],
      digestFrequency: "immediate",
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      priority: "all",
    });
  });

  it("restores saved preferences on the next visit, so nothing is lost on reload", () => {
    const first = renderPage();
    fireEvent.click(toggle("Toggle Webhook channel"));
    fireEvent.click(screen.getByRole("radio", { name: /^Critical only/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hourly digest" }));
    fireEvent.click(toggle("Toggle notification sounds"));
    first.unmount();

    renderPage();

    expect(toggle("Toggle Webhook channel")).toHaveAttribute("aria-checked", "true");
    expect(toggle("Toggle In-app channel")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /^Critical only/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Hourly digest" })).toHaveClass("bg-stellar-blue");
    expect(toggle("Toggle notification sounds")).toHaveAttribute("aria-checked", "false");
  });

  it("falls back to defaults when the saved preferences are corrupt", () => {
    localStorage.setItem(EXTENDED_KEY, "{not json");
    renderPage();

    expect(toggle("Toggle In-app channel")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /All severities/ })).toBeChecked();
  });
});
