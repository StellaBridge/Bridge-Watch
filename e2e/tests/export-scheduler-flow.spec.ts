import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";
import { ExportSchedulerPage } from "../pages/ExportSchedulerPage";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem(
      "bridge-watch:dashboard-tour:v1",
      JSON.stringify({ completed: true, lastStep: 0, seen: true })
    );
  });
  await mockCoreApi(page);
});

test("opens the New Schedule form from the page header", async ({ page }) => {
  const scheduler = new ExportSchedulerPage(page);
  await scheduler.goto();

  await scheduler.openNewScheduleForm();

  await expect(scheduler.nameInput).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
});

test("rejects a schedule with no name", async ({ page }) => {
  const scheduler = new ExportSchedulerPage(page);
  await scheduler.goto();
  await scheduler.openNewScheduleForm();

  await scheduler.createButton.click();

  await expect(page.getByRole("alert")).toHaveText("Name is required.");
  await expect(scheduler.nameInput).toHaveAttribute("aria-invalid", "true");
});

test("rejects an invalid recipient email for email delivery", async ({ page }) => {
  const scheduler = new ExportSchedulerPage(page);
  await scheduler.goto();
  await scheduler.openNewScheduleForm();

  await scheduler.nameInput.fill("Weekly analytics");
  await scheduler.deliveryEmailButton.click();
  await scheduler.emailInput.fill("not-an-email");
  await scheduler.createButton.click();

  await expect(page.getByRole("alert")).toHaveText("Enter a valid email address.");
  await expect(scheduler.emailInput).toHaveAttribute("aria-invalid", "true");
});

test("creates a weekly email schedule and lists its frequency and recipient", async ({ page }) => {
  const scheduler = new ExportSchedulerPage(page);
  await scheduler.goto();
  await scheduler.openNewScheduleForm();

  await scheduler.nameInput.fill("Weekly analytics");
  await scheduler.frequencyGroup.getByRole("button", { name: "Weekly" }).click();
  await page.getByLabel("Day of Week").selectOption({ label: "Friday" });
  await scheduler.deliveryEmailButton.click();
  await scheduler.emailInput.fill("analyst@example.com");
  await scheduler.createButton.click();

  // The form closes on success, so the schedule shows up in the list.
  await expect(scheduler.scheduleForm).toBeHidden();
  await expect(page.getByText("Weekly analytics", { exact: true })).toBeVisible();
  await expect(page.getByText("Weekly on Fri at 08:00", { exact: false })).toBeVisible();
  await expect(page.getByText("Delivery: Email → analyst@example.com")).toBeVisible();
});

test("Run now queues an immediate export for an existing schedule", async ({ page }) => {
  const scheduler = new ExportSchedulerPage(page);
  await scheduler.goto();
  await scheduler.createDailyDownloadSchedule("Daily health snapshot");

  await page.getByRole("button", { name: "Run now" }).click();

  await expect(page.getByRole("status")).toHaveText(
    '"Daily health snapshot" queued for immediate export.'
  );
  await expect(page.getByText(/Last ran:/)).toBeVisible();
});

test("calendar view marks the active schedule on the grid", async ({ page }) => {
  const scheduler = new ExportSchedulerPage(page);
  await scheduler.goto();
  await scheduler.createDailyDownloadSchedule("Daily calendar export");

  await scheduler.calendarView.click();

  await expect(scheduler.calendarView).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Daily calendar export", { exact: true }).first()).toBeVisible();
});

// Not covered: the issue asks for a "Schedule Report" modal and an "Export Now"
// button that downloads a report. ExportScheduler.tsx has an inline form behind
// "+ New Schedule", and its instant action is "Run now", which only records a
// run in localStorage. No download is triggered, so no download is asserted here.
// The issue also names /admin/export-scheduler; the route is /export-scheduler.
