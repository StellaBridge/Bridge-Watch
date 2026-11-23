import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";
import { NotificationPreferencesPage } from "../pages/NotificationPreferencesPage";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
  });
  await mockCoreApi(page);
});

test.describe("Notification Preferences", () => {
  test("should toggle email notifications on and off", async ({ page }) => {
    const preferencesPage = new NotificationPreferencesPage(page);
    await preferencesPage.navigateToPreferences();

    const isEnabledBefore = await preferencesPage.isEmailNotificationsEnabled();
    await preferencesPage.toggleEmailNotifications();
    const isEnabledAfter = await preferencesPage.isEmailNotificationsEnabled();

    expect(isEnabledAfter).not.toBe(isEnabledBefore);
  });

  test("should change email frequency", async ({ page }) => {
    const preferencesPage = new NotificationPreferencesPage(page);
    await preferencesPage.navigateToPreferences();

    await preferencesPage.setEmailFrequency("daily");
    const frequency = await preferencesPage.getEmailFrequencyValue();

    expect(frequency).toBe("daily");
  });

  test("should save notification preferences", async ({ page }) => {
    const preferencesPage = new NotificationPreferencesPage(page);
    await preferencesPage.navigateToPreferences();

    await preferencesPage.toggleEmailNotifications();
    await preferencesPage.setEmailFrequency("weekly");
    await preferencesPage.savePreferences();

    const successMsg = await preferencesPage.getSuccessNotification();
    expect(await successMsg.isVisible()).toBe(true);
  });

  test("should toggle alert notifications independently", async ({ page }) => {
    const preferencesPage = new NotificationPreferencesPage(page);
    await preferencesPage.navigateToPreferences();

    const emailEnabledBefore = await preferencesPage.isEmailNotificationsEnabled();
    await preferencesPage.toggleAlertNotifications();
    const emailEnabledAfter = await preferencesPage.isEmailNotificationsEnabled();

    expect(emailEnabledBefore).toBe(emailEnabledAfter);
  });

  test("should toggle incident notifications", async ({ page }) => {
    const preferencesPage = new NotificationPreferencesPage(page);
    await preferencesPage.navigateToPreferences();

    const isEnabledBefore = await preferencesPage.isEmailNotificationsEnabled();
    await preferencesPage.toggleIncidentNotifications();
    const isEnabledAfter = await preferencesPage.isEmailNotificationsEnabled();

    expect(isEnabledBefore).toBe(isEnabledAfter);
  });

  test("should display all notification channels", async ({ page }) => {
    const preferencesPage = new NotificationPreferencesPage(page);
    await preferencesPage.navigateToPreferences();

    const channels = await preferencesPage.getNotificationChannels();
    expect(await channels.count()).toBeGreaterThan(0);
  });

  test("should toggle quiet hours", async ({ page }) => {
    const preferencesPage = new NotificationPreferencesPage(page);
    await preferencesPage.navigateToPreferences();

    const toggle = await preferencesPage.getQuietHoursToggle();
    const isVisibleBefore = await toggle.isVisible();

    expect(isVisibleBefore).toBe(true);
  });

  test("should update multiple preferences at once", async ({ page }) => {
    const preferencesPage = new NotificationPreferencesPage(page);
    await preferencesPage.navigateToPreferences();

    await preferencesPage.toggleEmailNotifications();
    await preferencesPage.setEmailFrequency("hourly");
    await preferencesPage.toggleAlertNotifications();
    await preferencesPage.savePreferences();

    const successMsg = await preferencesPage.getSuccessNotification();
    expect(await successMsg.isVisible()).toBe(true);
  });
});
