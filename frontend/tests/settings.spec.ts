import { test, expect, type Page } from "@playwright/test";

const book = { id: "framework", name: "Open Source Framework Documentation Auditor", description: "Review policy", version: "1.0.0", rules: [] };
const record = (content = "Document text") => ({ id: "settings-scan", content, sourceName: "document.md", sourceType: "paste", rulebookId: book.id, rulebookName: book.name, lineCount: 1, errorCount: 1, warningCount: 1, infoCount: 0, compliant: false, createdAt: "2026-10-08T08:00:00Z", findings: [
  { ruleId: "error", title: "Insecure URL", message: "Use HTTPS", suggestion: "Replace HTTP with HTTPS.", category: "Transport", severity: "ERROR", lineNumber: 1, lineText: content, excerpt: content, matchStart: 0, matchEnd: 4 },
  { ruleId: "warning", title: "Version warning", message: "Review the supported version", category: "Version", severity: "WARNING", lineNumber: 1, lineText: content, excerpt: content, matchStart: 5, matchEnd: 8 },
] });
async function catalog(page: Page) {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/export")) return route.fulfill({ contentType: "text/plain", body: "Report content" });
    if (path.endsWith("/scans") && route.request().method() === "POST") return route.fulfill({ json: record(route.request().postDataJSON().content) });
    return route.fulfill({ json: path.endsWith("/health") ? { status: "ok" } : path.endsWith("/schema") ? { type: "object" } : path.endsWith("/effective") ? book : path.endsWith("/rulebooks") ? [book] : [] });
  });
}
async function ready(page: Page) {
  await catalog(page); await page.goto("/");
  await expect(page.getByRole("button", { name: "Audit Document", exact: true })).toBeEnabled();
}
async function settings(page: Page) { await page.getByRole("button", { name: "Settings", exact: true }).click(); }
let errors: string[];
test.beforeEach(({ page }) => { errors = []; page.on("pageerror", error => errors.push(error.message)); });
test.afterEach(() => expect(errors).toEqual([]));

test("appearance and editor preferences persist and reset, including system theme", async ({ page }) => {
  await ready(page); await settings(page);
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await page.getByLabel("Interface spacing").selectOption("compact");
  await page.getByLabel("Editor font size").selectOption("16");
  await page.getByLabel("Wrap long lines").uncheck();
  await page.reload();
  await expect(page.getByRole("button", { name: "Audit Document", exact: true })).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.getByLabel("Document content")).toHaveCSS("font-size", "16px");
  await expect(page.getByLabel("Document content")).toHaveCSS("white-space", "pre");
  await settings(page);
  await expect(page.getByLabel("Wrap long lines")).not.toBeChecked();
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Reset preferences" }).click();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("dark");
  await expect(page.getByLabel("Editor font size")).toHaveValue("13");
  await expect(page.getByLabel("Wrap long lines")).toBeChecked();
});

test("audit preferences control new scans, report downloads, and review before upload", async ({ page }) => {
  await ready(page); await settings(page);
  await page.getByLabel("Audit after upload").uncheck();
  await page.getByLabel("Default findings filter").selectOption("WARNING");
  await page.getByLabel("Preferred report format").selectOption("markdown");
  await page.getByRole("button", { name: "Auditor Workspace", exact: true }).click();
  let uploads = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/scans/upload")) uploads++; });
  await page.getByLabel("Upload text document", { exact: true }).setInputFiles({ name: "review.md", mimeType: "text/plain", buffer: Buffer.from("http://example.test v1") });
  await expect(page.getByLabel("Document content")).toHaveValue("http://example.test v1");
  await expect(page.getByRole("status")).toContainText("Imported review.md");
  expect(uploads).toBe(0);
  await expect(page.locator(".scorecard")).toHaveCount(0);
  await page.getByRole("button", { name: "Audit Document", exact: true }).click();
  await expect(page.locator(".finding-card")).toHaveCount(1);
  await expect(page.locator(".finding-title")).toHaveText("Version warning");
  const download = page.waitForEvent("download");
  const exportRequest = page.waitForRequest(request => request.url().includes("/export?format=markdown"));
  await page.getByRole("button", { name: "Download report", exact: true }).click();
  await exportRequest;
  expect((await download).suggestedFilename()).toMatch(/\.md$/);
});

test("connection validation and switching use the new backend and clear old data", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Audit Document", exact: true }).click();
  await expect(page.locator(".scorecard")).toBeVisible();
  await settings(page);
  await page.getByLabel("API base URL").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.getByRole("alert")).toContainText("HTTP(S)");
  let switchedRequests: string[] = [];
  await page.route("**/alternate-api/**", route => {
    const path = new URL(route.request().url()).pathname; switchedRequests.push(path);
    return route.fulfill({ json: path.endsWith("/health") ? { status: "ok" } : path.endsWith("/schema") ? { type: "object" } : [] });
  });
  await page.getByLabel("API base URL").fill("/alternate-api/");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.getByRole("status")).toHaveText("Connection saved and checked.");
  expect(switchedRequests).toContain("/alternate-api/rulebooks");
  expect(switchedRequests).toContain("/alternate-api/scans");
  await page.getByRole("button", { name: "Reset preferences" }).click();
  await expect(page.getByLabel("API base URL")).toHaveValue("/alternate-api");
  await page.getByRole("button", { name: "Auditor Workspace", exact: true }).click();
  await expect(page.getByRole("button", { name: "Audit Document", exact: true })).toBeDisabled();
  await expect(page.locator(".scorecard")).toHaveCount(0);
  await page.reload(); await settings(page);
  await expect(page.getByLabel("API base URL")).toHaveValue("/alternate-api");
  await expect(page.getByText("Database connected", { exact: true })).toBeVisible();
});

test("invalid stored preferences recover and upload review works while disconnected", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("teddysnow.preferences.v1", JSON.stringify({ theme: "unexpected", editorFontSize: 1000, autoScanUploads: false }));
    localStorage.setItem("teddysnow.api-base-url.v1", "invalid url");
  });
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.goto("/");
  await expect(page.locator("fieldset")).toBeEnabled();
  await page.getByLabel("Upload text document", { exact: true }).setInputFiles({ name: "offline.txt", mimeType: "text/plain", buffer: Buffer.from("Review offline \ufffd") });
  await expect(page.getByLabel("Document content")).toHaveValue("Review offline \ufffd");
  await expect(page.getByRole("button", { name: "Audit Document", exact: true })).toBeDisabled();
  await settings(page);
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("dark");
  await expect(page.getByLabel("Editor font size")).toHaveValue("13");
  await expect(page.getByLabel("API base URL")).toHaveValue("/api");
});

test("help opens with keyboard focus, closes with Escape, and logo is downloadable", async ({ page }) => {
  await ready(page);
  const trigger = page.locator("header").getByRole("button", { name: "How it works", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close help" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await settings(page);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download logo" }).click();
  expect((await download).suggestedFilename()).toBe("teddysnow-logo.svg");
});

test("all workspace tabs fit mobile to wide desktop in both themes", async ({ page }, testInfo) => {
  await ready(page);
  for (const theme of ["dark", "light"]) {
    await settings(page); await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const tab of ["Auditor Workspace", "JSON Rulebook & Schema Studio", "Scan History", "CI/CD & CLI", "Settings"]) {
        await page.getByRole("button", { name: tab, exact: true }).click();
        const dimensions = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
        expect(dimensions[0], `${tab} at ${width}px (${theme})`).toBeLessThanOrEqual(dimensions[1]);
        if ((width === 375 || width === 1440) && ["Settings", "Auditor Workspace"].includes(tab)) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: testInfo.outputPath(`${tab.replaceAll(" ", "-")}-${width}-${theme}.png`), fullPage: true });
        }
      }
    }
  }
});
