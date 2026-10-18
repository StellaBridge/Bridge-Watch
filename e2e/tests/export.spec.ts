import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem(
      "bridge-watch:dashboard-tour:v1",
      JSON.stringify({ completed: true, lastStep: 0, seen: true }),
    );
    Object.defineProperty(window, "__printCalled", { value: false, writable: true });
    window.print = () => {
      (window as Window & { __printCalled: boolean }).__printCalled = true;
    };
  });
  await mockCoreApi(page);
  await page.goto("/reports", { waitUntil: "networkidle" });
});

test("downloads CSV whose rows match displayed asset data", async ({ page }) => {
  const xlmRow = page.getByRole("row").filter({ hasText: "XLM" }).first();
  await expect(xlmRow).toBeVisible();
  const displayedScore = (await xlmRow.getByRole("cell").nth(2).innerText()).trim();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export as CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);

  const path = await download.path();
  expect(path).not.toBeNull();
  const contents = await readFile(path!, "utf8");
  expect(contents).toContain("Symbol,Name,Health Score,Trend");
  const csvScore = displayedScore === "—" ? "" : displayedScore;
  expect(contents).toContain(`XLM,Stellar Lumens,${csvScore},`);
});

test("downloads JSON matching data in the active report", async ({ page }) => {
  const xlmRow = page.getByRole("row").filter({ hasText: "XLM" }).first();
  await expect(xlmRow).toBeVisible();
  const displayedScore = (await xlmRow.getByRole("cell").nth(2).innerText()).trim();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export as JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);

  const path = await download.path();
  expect(path).not.toBeNull();
  const contents = JSON.parse(await readFile(path!, "utf8")) as Array<{
    symbol: string;
    health: { overallScore: number } | null;
  }>;
  const exportedXlm = contents.find((asset) => asset.symbol === "XLM");
  expect(exportedXlm?.symbol).toBe("XLM");
  expect(String(exportedXlm?.health?.overallScore ?? "—")).toBe(displayedScore);
});

test("applies a report template and date range before export", async ({ page }) => {
  await page.getByRole("button", { name: "Bridge Status" }).click();
  const fromDate = page.locator("#date-from");
  const toDate = page.locator("#date-to");
  await fromDate.fill("2026-01-01");
  await toDate.fill("2026-02-01");
  await expect(fromDate).toHaveValue("2026-01-01");
  await expect(toDate).toHaveValue("2026-02-01");

  const allbridgeRow = page.getByRole("row").filter({ hasText: "Allbridge" }).first();
  await expect(allbridgeRow).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export as CSV" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const contents = await readFile(path!, "utf8");
  expect(contents).toContain("Bridge,Status,TVL,Supply (Stellar),Supply (Source),Mismatch %");
  expect(contents).toContain("Allbridge");
});

test("starts PDF generation through the browser print action", async ({ page }) => {
  await page.getByRole("button", { name: "Print / Export PDF" }).click();
  await expect.poll(() =>
    page.evaluate(() => (window as Window & { __printCalled: boolean }).__printCalled),
  ).toBe(true);
});
