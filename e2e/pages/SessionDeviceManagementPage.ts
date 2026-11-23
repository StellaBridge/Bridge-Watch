import { Page, Locator } from "@playwright/test";

export class SessionDeviceManagementPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigateToSessions() {
    await this.page.goto("/settings/sessions-devices", { waitUntil: "networkidle" });
  }

  async getActiveSessions(): Promise<Locator> {
    return this.page.locator('[data-testid="active-session"]');
  }

  async getActiveDevices(): Promise<Locator> {
    return this.page.locator('[data-testid="active-device"]');
  }

  async getDeviceByName(deviceName: string): Promise<Locator> {
    return this.page.locator(`[data-testid="active-device"][data-device-name="${deviceName}"]`);
  }

  async getDeviceTerminateButton(deviceName: string): Promise<Locator> {
    const device = await this.getDeviceByName(deviceName);
    return device.locator('[data-testid="terminate-device-button"]');
  }

  async terminateDevice(deviceName: string): Promise<void> {
    const btn = await this.getDeviceTerminateButton(deviceName);
    await btn.click();
  }

  async getTerminationConfirmationDialog(): Promise<Locator> {
    return this.page.locator('[data-testid="terminate-confirmation-dialog"]');
  }

  async getTerminationWarning(): Promise<string> {
    const dialog = await this.getTerminationConfirmationDialog();
    return (await dialog.locator('[data-testid="warning-message"]').textContent()) as string;
  }

  async getConfirmTerminationButton(): Promise<Locator> {
    const dialog = await this.getTerminationConfirmationDialog();
    return dialog.locator('[data-testid="confirm-terminate-button"]');
  }

  async confirmTermination(): Promise<void> {
    const btn = await this.getConfirmTerminationButton();
    await btn.click();
  }

  async getCancelTerminationButton(): Promise<Locator> {
    const dialog = await this.getTerminationConfirmationDialog();
    return dialog.locator('[data-testid="cancel-button"]');
  }

  async getSuccessNotification(): Promise<Locator> {
    return this.page.locator('[data-testid="device-terminated-notification"]');
  }

  async getDeviceInfo(deviceName: string): Promise<Record<string, string>> {
    const device = await this.getDeviceByName(deviceName);
    const info: Record<string, string> = {};

    const deviceType = await device.locator('[data-testid="device-type"]').textContent();
    const browser = await device.locator('[data-testid="device-browser"]').textContent();
    const lastActive = await device.locator('[data-testid="device-last-active"]').textContent();

    if (deviceType) info["type"] = deviceType;
    if (browser) info["browser"] = browser;
    if (lastActive) info["lastActive"] = lastActive;

    return info;
  }

  async getCurrentSession(): Promise<Locator> {
    return this.page.locator('[data-testid="current-session"]');
  }

  async getCurrentSessionInfo(): Promise<Record<string, string>> {
    const session = await this.getCurrentSession();
    const info: Record<string, string> = {};

    const device = await session.locator('[data-testid="session-device"]').textContent();
    const browser = await session.locator('[data-testid="session-browser"]').textContent();
    const ipAddress = await session.locator('[data-testid="session-ip"]').textContent();

    if (device) info["device"] = device;
    if (browser) info["browser"] = browser;
    if (ipAddress) info["ipAddress"] = ipAddress;

    return info;
  }

  async getTerminateAllButton(): Promise<Locator> {
    return this.page.locator('[data-testid="terminate-all-devices-button"]');
  }

  async terminateAllDevices(): Promise<void> {
    const btn = await this.getTerminateAllButton();
    await btn.click();
  }

  async isDeviceActive(deviceName: string): Promise<boolean> {
    const device = await this.getDeviceByName(deviceName);
    const status = await device.locator('[data-testid="device-status"]').textContent();
    return status === "Active";
  }
}
