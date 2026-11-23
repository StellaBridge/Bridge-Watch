import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem("bridge-watch:auth:token", "mock-jwt-token");
    window.localStorage.setItem("bridge-watch:auth:user", JSON.stringify({
      id: "user-123",
      email: "test@example.com",
      role: "admin"
    }));
  });
  await mockCoreApi(page);
  
  await page.route("**/api/v1/api-keys", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          keys: [
            {
              id: "key-1",
              name: "Production API",
              scopes: ["read:bridges", "read:analytics"],
              status: "active",
              created_at: "2026-01-15T10:00:00Z",
              last_used_at: "2026-11-20T14:30:00Z"
            }
          ]
        })
      });
    } else if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: {
            id: "key-new",
            name: "Test API Key",
            scopes: ["read:bridges"],
            status: "active",
            created_at: new Date().toISOString(),
            api_key: "bw_live_abcdef123456789"
          }
        })
      });
    }
  });

  await page.route("**/api/v1/api-keys/*/revoke", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: {
          id: route.request().url().match(/api-keys\/([^\/]+)/)?.[1],
          status: "revoked",
          revoked_at: new Date().toISOString()
        }
      })
    });
  });
});

test("navigating to API Keys page as authenticated user", async ({ page }) => {
  await page.goto("/settings/api-keys", { waitUntil: "networkidle" });
  
  await expect(page.locator("h1")).toContainText("API Keys");
  await expect(page.getByRole("button", { name: /Generate|Create/ })).toBeVisible();
});

test("generating new API key with read:bridges scope", async ({ page }) => {
  await page.goto("/settings/api-keys", { waitUntil: "networkidle" });
  
  await page.getByRole("button", { name: /Generate New Key|Create New Key/ }).click();
  
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  
  await dialog.getByLabel(/Name|Key Name/).fill("Test API Key");
  await dialog.getByRole("checkbox", { name: /read:bridges/ }).check();
  
  await dialog.getByRole("button", { name: /Generate|Create|Submit/ }).click();
  
  const keyModal = page.locator('[data-testid="api-key-modal"]');
  await expect(keyModal).toBeVisible();
  
  const keyValue = keyModal.locator('[data-testid="api-key-value"]');
  await expect(keyValue).toContainText(/bw_live_/);
});

test("copying generated API key from one-time modal", async ({ page }) => {
  await page.goto("/settings/api-keys", { waitUntil: "networkidle" });
  
  await page.getByRole("button", { name: /Generate New Key|Create New Key/ }).click();
  
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Name|Key Name/).fill("Test API Key");
  await dialog.getByRole("checkbox", { name: /read:bridges/ }).check();
  await dialog.getByRole("button", { name: /Generate|Create|Submit/ }).click();
  
  const keyModal = page.locator('[data-testid="api-key-modal"]');
  await expect(keyModal).toBeVisible();
  
  const copyButton = keyModal.getByRole("button", { name: /Copy/ });
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  
  await expect(copyButton).toContainText(/Copied|✓/);
});

test("revoking API key updates status to Revoked in table", async ({ page }) => {
  await page.goto("/settings/api-keys", { waitUntil: "networkidle" });
  
  await page.waitForResponse(response => 
    response.url().includes("/api/v1/api-keys") && response.status() === 200
  );
  
  const keyRow = page.locator('[data-key-id="key-1"]');
  await expect(keyRow).toBeVisible();
  
  const revokeButton = keyRow.getByRole("button", { name: /Revoke/ });
  await revokeButton.click();
  
  const confirmDialog = page.getByRole("dialog");
  await confirmDialog.getByRole("button", { name: /Confirm|Revoke/ }).click();
  
  await page.waitForResponse(response => 
    response.url().includes("/revoke") && response.status() === 200
  );
  
  await expect(keyRow.locator('[data-testid="key-status"]')).toContainText("Revoked");
});
