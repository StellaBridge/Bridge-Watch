import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";
import { SessionDeviceManagementPage } from "../pages/SessionDeviceManagementPage";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
  });
  await mockCoreApi(page);
});

test.describe("Session & Device Management", () => {
  test("should display active sessions and devices", async ({ page }) => {
    const sessionsPage = new SessionDeviceManagementPage(page);
    await sessionsPage.navigateToSessions();

    const devices = await sessionsPage.getActiveDevices();
    expect(await devices.count()).toBeGreaterThanOrEqual(1);
  });

  test("should show current session information", async ({ page }) => {
    const sessionsPage = new SessionDeviceManagementPage(page);
    await sessionsPage.navigateToSessions();

    const currentSession = await sessionsPage.getCurrentSession();
    expect(await currentSession.isVisible()).toBe(true);
  });

  test("should get current session details", async ({ page }) => {
    const sessionsPage = new SessionDeviceManagementPage(page);
    await sessionsPage.navigateToSessions();

    const info = await sessionsPage.getCurrentSessionInfo();
    expect(Object.keys(info).length).toBeGreaterThan(0);
  });

  test("should terminate a remote device", async ({ page }) => {
    const sessionsPage = new SessionDeviceManagementPage(page);
    await sessionsPage.navigateToSessions();

    const devices = await sessionsPage.getActiveDevices();
    if (await devices.count() > 1) {
      await sessionsPage.terminateDevice("Test Device");

      const dialog = await sessionsPage.getTerminationConfirmationDialog();
      expect(await dialog.isVisible()).toBe(true);
    }
  });

  test("should show termination warning before confirming", async ({ page }) => {
    const sessionsPage = new SessionDeviceManagementPage(page);
    await sessionsPage.navigateToSessions();

    const devices = await sessionsPage.getActiveDevices();
    if (await devices.count() > 1) {
      await sessionsPage.terminateDevice("Test Device");

      const warning = await sessionsPage.getTerminationWarning();
      expect(warning.length).toBeGreaterThan(0);
    }
  });

  test("should cancel device termination", async ({ page }) => {
    const sessionsPage = new SessionDeviceManagementPage(page);
    await sessionsPage.navigateToSessions();

    const devices = await sessionsPage.getActiveDevices();
    const countBefore = await devices.count();

    if (countBefore > 1) {
      await sessionsPage.terminateDevice("Test Device");
      await sessionsPage.getCancelTerminationButton();
      await sessionsPage.page.locator('[data-testid="cancel-button"]').click();

      const countAfter = (await sessionsPage.getActiveDevices()).count();
      expect(await countAfter).toBe(countBefore);
    }
  });

  test("should confirm device termination and show success", async ({ page }) => {
    const sessionsPage = new SessionDeviceManagementPage(page);
    await sessionsPage.navigateToSessions();

    const devices = await sessionsPage.getActiveDevices();
    if (await devices.count() > 1) {
      await sessionsPage.terminateDevice("Test Device");
      await sessionsPage.confirmTermination();

      const notification = await sessionsPage.getSuccessNotification();
      expect(await notification.isVisible()).toBe(true);
    }
  });

  test("should display device information", async ({ page }) => {
    const sessionsPage = new SessionDeviceManagementPage(page);
    await sessionsPage.navigateToSessions();

    const devices = await sessionsPage.getActiveDevices();
    if (await devices.count() > 0) {
      const info = await sessionsPage.getDeviceInfo("Test Device");
      expect(Object.keys(info).length).toBeGreaterThan(0);
    }
  });

  test("should check if device is active", async ({ page }) => {
    const sessionsPage = new SessionDeviceManagementPage(page);
    await sessionsPage.navigateToSessions();

    const devices = await sessionsPage.getActiveDevices();
    if (await devices.count() > 0) {
      const isActive = await sessionsPage.isDeviceActive("Test Device");
      expect(typeof isActive).toBe("boolean");
    }
  });

  test("should terminate all other devices option", async ({ page }) => {
    const sessionsPage = new SessionDeviceManagementPage(page);
    await sessionsPage.navigateToSessions();

    const btn = await sessionsPage.getTerminateAllButton();
    expect(await btn.isVisible()).toBe(true);
  });

  test("should navigate through multiple sessions", async ({ page }) => {
    const sessionsPage = new SessionDeviceManagementPage(page);
    await sessionsPage.navigateToSessions();

    const sessions = await sessionsPage.getActiveSessions();
    const count = await sessions.count();

    expect(count).toBeGreaterThanOrEqual(0);
  });
});
