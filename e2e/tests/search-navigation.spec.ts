import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem(
      "bridge-watch:dashboard-tour:v1",
      JSON.stringify({ completed: true, lastStep: 0, seen: true }),
    );
  });
  await mockCoreApi(page);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
});

test("opens global search with the Cmd+K shortcut", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Global search" })).toBeVisible();
  await expect(
    page.getByPlaceholder("Search assets, bridges, incidents, alerts, pages..."),
  ).toBeFocused();
});

test("shows valid search results and navigates to the selected page", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Search assets, bridges, incidents, alerts, pages...").fill("Bridges");
  const result = page.getByRole("option", { name: /Bridges/ });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page).toHaveURL(/\/bridges(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Bridges" })).toBeVisible();
});

test("shows an empty state for a query with no matches", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Search assets, bridges, incidents, alerts, pages...").fill("no-such-result-987");
  await expect(page.getByText(/No results for/)).toBeVisible();
});

test("persists selected search results as recent history", async ({ page }) => {
  await page.getByRole("button", { name: /Open search/ }).click();
  await page.getByPlaceholder("Search assets, bridges, incidents, alerts, pages...").fill("Bridges");
  await page.getByRole("option", { name: /Cross-chain bridge/ }).click();
  await expect(page).toHaveURL(/\/bridges(?:\?|$)/);
  await expect(page.getByRole("dialog", { name: "Global search" })).toBeHidden();

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("bridge-watch:recent-searches")))
    .toContain('"title":"Bridges"');

  await page.reload({ waitUntil: "networkidle" });
  await page.keyboard.press("Control+k");
  await expect(page.getByText("Recent", { exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: /Cross-chain bridge/ })).toBeVisible();
});
