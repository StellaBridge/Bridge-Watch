import { Page, Locator } from "@playwright/test";

export class NotificationPreferencesPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigateToPreferences() {
    await this.page.goto("/settings/notifications", { waitUntil: "networkidle" });
  }

  async getEmailNotificationToggle(): Promise<Locator> {
    return this.page.locator('[data-testid="email-notifications-toggle"]');
  }

  async getAlertNotificationToggle(): Promise<Locator> {
    return this.page.locator('[data-testid="alert-notifications-toggle"]');
  }

  async getIncidentNotificationToggle(): Promise<Locator> {
    return this.page.locator('[data-testid="incident-notifications-toggle"]');
  }

  async toggleEmailNotifications(): Promise<void> {
    const toggle = await this.getEmailNotificationToggle();
    await toggle.click();
  }

  async toggleAlertNotifications(): Promise<void> {
    const toggle = await this.getAlertNotificationToggle();
    await toggle.click();
  }

  async toggleIncidentNotifications(): Promise<void> {
    const toggle = await this.getIncidentNotificationToggle();
    await toggle.click();
  }

  async getEmailFrequencySelect(): Promise<Locator> {
    return this.page.locator('[data-testid="email-frequency-select"]');
  }

  async setEmailFrequency(frequency: "immediate" | "hourly" | "daily" | "weekly"): Promise<void> {
    const select = await this.getEmailFrequencySelect();
    await select.selectOption(frequency);
  }

  async getEmailFrequencyValue(): Promise<string> {
    const select = await this.getEmailFrequencySelect();
    return (await select.inputValue()) as string;
  }

  async getSaveButton(): Promise<Locator> {
    return this.page.locator('[data-testid="save-preferences-button"]');
  }

  async savePreferences(): Promise<void> {
    const saveBtn = await this.getSaveButton();
    await saveBtn.click();
  }

  async getSuccessNotification(): Promise<Locator> {
    return this.page.locator('[data-testid="success-notification"]');
  }

  async isEmailNotificationsEnabled(): Promise<boolean> {
    const toggle = await this.getEmailNotificationToggle();
    const ariaChecked = await toggle.getAttribute("aria-checked");
    return ariaChecked === "true";
  }

  async isAlertNotificationsEnabled(): Promise<boolean> {
    const toggle = await this.getAlertNotificationToggle();
    const ariaChecked = await toggle.getAttribute("aria-checked");
    return ariaChecked === "true";
  }

  async getNotificationChannels(): Promise<Locator> {
    return this.page.locator('[data-testid="notification-channel"]');
  }

  async getQuietHoursToggle(): Promise<Locator> {
    return this.page.locator('[data-testid="quiet-hours-toggle"]');
  }

  async getQuietHoursStartTime(): Promise<Locator> {
    return this.page.locator('[data-testid="quiet-hours-start"]');
  }

  async getQuietHoursEndTime(): Promise<Locator> {
    return this.page.locator('[data-testid="quiet-hours-end"]');
  }
}
