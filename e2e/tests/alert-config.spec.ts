import { test, expect } from "@playwright/test";
import { AlertConfigPage } from "../pages/AlertConfigPage";
import { mockCoreApi } from "../utils/mockApi";

test.describe("Alert Configuration Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
      window.localStorage.setItem("bridge-watch:dashboard-tour:v1", JSON.stringify({ completed: true, lastStep: 0, seen: true }));
      window.localStorage.removeItem("bw_read_incidents");
    });
    await mockCoreApi(page);
  });

  test("creates a new alert routing rule", async ({ page }) => {
    const configPage = new AlertConfigPage(page);

    await configPage.goto();

    // Set admin token (mock value for testing)
    await configPage.setAdminToken("test-admin-token");

    // Click add rule
    await configPage.clickAddRule();

    // Fill rule form
    await configPage.fillRuleForm({
      name: "Test Critical Alerts",
      ownerAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      severities: ["critical", "high"],
      channels: ["in_app", "webhook"],
      assetCodes: "USDC, EURC",
      sourceTypes: "bridge, oracle",
      suppressionWindow: 300,
      priorityOrder: 50,
      isActive: true,
    });

    // Save rule
    await configPage.saveRule();

    // Verify rule appears in list
    await configPage.assertRuleVisible("Test Critical Alerts");
  });

  test("edits an existing alert routing rule", async ({ page }) => {
    const configPage = new AlertConfigPage(page);

    await configPage.goto();
    await configPage.setAdminToken("test-admin-token");

    // Assuming a rule exists from previous test or setup
    // First create a rule to edit
    await configPage.clickAddRule();
    await configPage.fillRuleForm({
      name: "Editable Rule",
      ownerAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      severities: ["critical"],
      channels: ["in_app"],
      isActive: true,
    });
    await configPage.saveRule();

    // Edit the rule
    await configPage.editRule("Editable Rule");
    await configPage.fillRuleForm({
      name: "Edited Rule Name",
      ownerAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      severities: ["critical", "high", "medium"],
      channels: ["in_app", "webhook", "email"],
      assetCodes: "USDC",
      sourceTypes: "bridge",
      suppressionWindow: 600,
      priorityOrder: 10,
      isActive: true,
    });
    await configPage.saveRule();

    // Verify updated rule appears
    await configPage.assertRuleVisible("Edited Rule Name");
    await configPage.assertRuleHidden("Editable Rule");
  });

  test("enables and disables an alert rule", async ({ page }) => {
    const configPage = new AlertConfigPage(page);

    await configPage.goto();
    await configPage.setAdminToken("test-admin-token");

    // Create a rule
    await configPage.clickAddRule();
    await configPage.fillRuleForm({
      name: "Toggle Rule",
      ownerAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      severities: ["critical"],
      channels: ["in_app"],
      isActive: true,
    });
    await configPage.saveRule();

    // Disable the rule
    await configPage.disableRule("Toggle Rule");
    // Verify rule is disabled (might show as inactive)
    await configPage.assertRuleVisible("Toggle Rule");

    // Enable the rule
    await configPage.enableRule("Toggle Rule");
    await configPage.assertRuleVisible("Toggle Rule");
  });

  test("deletes an alert rule with confirmation", async ({ page }) => {
    const configPage = new AlertConfigPage(page);

    await configPage.goto();
    await configPage.setAdminToken("test-admin-token");

    // Create a rule to delete
    await configPage.clickAddRule();
    await configPage.fillRuleForm({
      name: "Rule To Delete",
      ownerAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      severities: ["critical"],
      channels: ["in_app"],
      isActive: true,
    });
    await configPage.saveRule();

    // Delete the rule
    await configPage.deleteRule("Rule To Delete");

    // Verify rule is gone
    await configPage.assertRuleHidden("Rule To Delete");
  });

  test("simulates an alert for a rule", async ({ page }) => {
    const configPage = new AlertConfigPage(page);

    await configPage.goto();
    await configPage.setAdminToken("test-admin-token");

    // Create a rule
    await configPage.clickAddRule();
    await configPage.fillRuleForm({
      name: "Simulation Rule",
      ownerAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      severities: ["critical"],
      channels: ["in_app", "webhook"],
      isActive: true,
    });
    await configPage.saveRule();

    // Simulate alert
    await configPage.simulateAlert("Simulation Rule");

    // Verify simulation completed (check for success toast or audit entry)
    await configPage.assertAuditEntryVisible("Simulation Rule");
  });

  test("filters rules by owner address", async ({ page }) => {
    const configPage = new AlertConfigPage(page);

    await configPage.goto();
    await configPage.setAdminToken("test-admin-token");

    // Create rules for different owners
    await configPage.clickAddRule();
    await configPage.fillRuleForm({
      name: "Owner 1 Rule",
      ownerAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      severities: ["critical"],
      channels: ["in_app"],
      isActive: true,
    });
    await configPage.saveRule();

    await configPage.clickAddRule();
    await configPage.fillRuleForm({
      name: "Owner 2 Rule",
      ownerAddress: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF",
      severities: ["critical"],
      channels: ["in_app"],
      isActive: true,
    });
    await configPage.saveRule();

    // Filter by owner 1
    await configPage.filterByOwner("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF");
    await configPage.assertRuleVisible("Owner 1 Rule");
    await configPage.assertRuleHidden("Owner 2 Rule");

    // Filter by owner 2
    await configPage.filterByOwner("GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF");
    await configPage.assertRuleVisible("Owner 2 Rule");
    await configPage.assertRuleHidden("Owner 1 Rule");

    // Clear filter
    await configPage.filterByOwner("");
    await configPage.assertRuleVisible("Owner 1 Rule");
    await configPage.assertRuleVisible("Owner 2 Rule");
  });

  test("validates required fields when creating a rule", async ({ page }) => {
    const configPage = new AlertConfigPage(page);

    await configPage.goto();
    await configPage.setAdminToken("test-admin-token");

    // Try to save without required fields
    await configPage.clickAddRule();
    await configPage.saveRule();

    // Should show validation errors
    await expect(configPage.errorMessage).toBeVisible();
  });

  test("cancels rule creation", async ({ page }) => {
    const configPage = new AlertConfigPage(page);

    await configPage.goto();
    await configPage.setAdminToken("test-admin-token");

    await configPage.clickAddRule();
    await configPage.fillRuleForm({
      name: "Cancelled Rule",
      ownerAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      severities: ["critical"],
      channels: ["in_app"],
      isActive: true,
    });
    await configPage.cancelRule();

    // Rule should not be created
    await configPage.assertRuleHidden("Cancelled Rule");
  });
});