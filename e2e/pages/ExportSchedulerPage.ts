import { type Locator, type Page, expect } from "@playwright/test";

export class ExportSchedulerPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newScheduleButton: Locator;
  readonly scheduleForm: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly createButton: Locator;
  readonly frequencyGroup: Locator;
  readonly deliveryEmailButton: Locator;
  readonly listView: Locator;
  readonly calendarView: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Export Scheduler", exact: true });
    this.newScheduleButton = page.getByRole("button", { name: /New Schedule|Cancel/ });
    this.scheduleForm = page.getByRole("form", { name: "Create export schedule" });
    this.nameInput = page.getByLabel("Schedule Name");
    this.emailInput = page.getByLabel("Email Address");
    this.createButton = page.getByRole("button", { name: "Create Schedule", exact: true });
    this.frequencyGroup = page.getByRole("group", { name: "Frequency" });
    this.deliveryEmailButton = page.getByRole("button", { name: "Email", exact: true });
    this.listView = page.getByRole("button", { name: "List", exact: true });
    this.calendarView = page.getByRole("button", { name: "Calendar", exact: true });
  }

  async goto(): Promise<void> {
    await this.page.goto("/export-scheduler", { waitUntil: "networkidle" });
    await expect(this.heading).toBeVisible({ timeout: 15000 });
  }

  async openNewScheduleForm(): Promise<void> {
    await this.page.getByRole("button", { name: "+ New Schedule" }).click();
    await expect(this.scheduleForm).toBeVisible();
  }

  /** Creates a daily in-app download schedule with the given name. */
  async createDailyDownloadSchedule(name: string): Promise<void> {
    await this.openNewScheduleForm();
    await this.nameInput.fill(name);
    await this.createButton.click();
    await expect(this.page.getByText(name, { exact: true })).toBeVisible();
  }
}
