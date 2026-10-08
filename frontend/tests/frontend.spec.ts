import { test, expect, type Page } from "@playwright/test";

let pageErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
});
test.afterEach(() => expect(pageErrors).toEqual([]));

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Catalog ready", { exact: true })).toBeVisible();
}
async function audit(page: Page) {
  const response = page.waitForResponse(res => res.url().endsWith("/api/scans") && res.request().method() === "POST");
  await page.getByRole("button", { name: "Audit Document", exact: true }).click();
  expect((await response).ok()).toBeTruthy();
  await expect(page.locator(".scorecard")).toBeVisible();
  await expect(page.locator("fieldset")).toBeEnabled();
}
async function fits(page: Page) {
  const overflow = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  expect(overflow.content).toBeLessThanOrEqual(overflow.viewport);
}

test("unavailable services show accurate status and retry recovers", async ({ page }) => {
  let available = false;
  const book = { id: "framework", name: "Open Source Framework Documentation Auditor", description: "Test", version: "1.0.0", rules: [] };
  await page.route("**/api/**", route => {
    if (!available) return route.fulfill({ status: 503, json: { error: "Test backend unavailable" } });
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith("/health") ? { status: "ok" } : path.endsWith("/schema") ? { type: "object", properties: {} } : path.endsWith("/effective") ? book : path.endsWith("/rulebooks") ? [book] : [] });
  });
  await page.goto("/");
  await expect(page.getByText("Database unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Audit Document", exact: true })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Test backend unavailable");
  available = true;
  await page.getByRole("button", { name: "Refresh connection" }).click();
  await expect(page.getByText("Database connected", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test.describe("live backend", () => {
  test.skip(!process.env.AUDITOR_API_URL, "Set AUDITOR_API_URL and API_PROXY_TARGET to an isolated backend for integration checks.");
  let createdScans: string[];
  let createdBooks: string[];
  let pendingResources: Promise<void>[];
  test.beforeEach(async ({ page }) => {
    createdScans = []; createdBooks = []; pendingResources = [];
    page.on("response", response => {
      if (response.request().method() !== "POST" || !response.ok()) return;
      const path = new URL(response.url()).pathname;
      if (path === "/api/scans" || path === "/api/scans/upload") pendingResources.push(response.json().then(record => { createdScans.push(record.id); }));
      if (path === "/api/rulebooks") pendingResources.push(response.json().then(book => { createdBooks.push(book.id); }));
    });
  });
  test.afterEach(async ({ request }) => {
    await Promise.all(pendingResources);
    for (const id of createdScans) await request.delete(`${process.env.AUDITOR_API_URL}/api/scans/${id}`);
    for (const id of createdBooks) await request.delete(`${process.env.AUDITOR_API_URL}/api/rulebooks/${id}`);
  });

  test("standalone preview origins are allowed by the API", async ({ request }) => {
    for (const origin of ["http://localhost:4173", "http://127.0.0.1:4173"]) {
      const response = await request.fetch(`${process.env.AUDITOR_API_URL}/api/scans`, {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
      });
      expect(response.ok()).toBeTruthy();
      expect(response.headers()["access-control-allow-origin"]).toBe(origin);
      expect(response.headers()["access-control-allow-methods"]).toContain("POST");
    }
  });

  test("scan, filters, exports, history, and stale-result feedback", async ({ page }) => {
    await ready(page);
    await audit(page);
    await expect(page.locator(".violation-mark").first()).toBeVisible();
    await page.getByRole("button", { name: /^Warnings \(/ }).click();
    await expect(page.locator(".finding-card.error")).toHaveCount(0);
    await page.getByRole("button", { name: "Next violation", exact: true }).click();
    await page.getByRole("button", { name: "All (", exact: false }).first().click();
    await page.getByRole("searchbox").fill("no-such-finding-xyz");
    await expect(page.getByText("No findings match current search filter.")).toBeVisible();
    await page.getByRole("searchbox").fill("");
    for (const name of ["Export SARIF", "Markdown", "JSON"]) {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name, exact: true }).click();
      expect((await download).suggestedFilename()).toMatch(/\.(sarif|md|json)$/);
      await expect(page.locator("fieldset")).toBeEnabled();
    }
    await page.getByLabel("Document content").fill("New document content");
    await expect(page.getByText(/This report is from an earlier/)).toBeVisible();
    await page.getByRole("button", { name: /Scan History/ }).click();
    await page.getByRole("button", { name: "View & Highlight" }).first().click();
    await expect(page.locator("fieldset")).toBeEnabled();
    await expect(page.getByText(/This report is from an earlier/)).toHaveCount(0);
  });

  test("phone, tablet, and desktop layouts fit every tab and studio view", async ({ page }, testInfo) => {
    await ready(page); await audit(page);
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const name of ["Auditor Workspace", "JSON Rulebook & Schema Studio", "Scan History", "CI/CD & CLI"]) {
        await page.getByRole("button", { name, exact: name !== "Scan History" }).first().click();
        await fits(page);
        if (name.includes("Studio")) {
          for (const view of ["Rule Cards", "Schema Spec", "JSON Editor"]) {
            await page.getByRole("button", { name: view, exact: view !== "Rule Cards" }).click();
            await fits(page);
          }
        }
      }
      if (width === 375 || width === 1440) {
        await page.getByRole("button", { name: "Auditor Workspace", exact: true }).click();
        await page.screenshot({ path: testInfo.outputPath(`auditor-${width}.png`), fullPage: true });
      }
    }
  });

  test("studio validates Java regex, creates and updates, and uses inherited draft rules", async ({ page }) => {
    await ready(page);
    await page.getByRole("button", { name: "JSON Rulebook & Schema Studio" }).click();
    await page.getByRole("button", { name: "New Rulebook", exact: true }).click();
    const draft = { name: `Frontend e2e ${Date.now()}`, description: "Integration test", version: "1.0.0", rules: [{ id: "test-rule", title: "Test rule", message: "Avoid bad", category: "Test", type: "FORBIDDEN_PATTERN", severity: "ERROR", enabled: true, pattern: "[" }] };
    await page.getByLabel("Rulebook JSON").fill(JSON.stringify(draft));
    await page.getByRole("button", { name: "Validate", exact: true }).click();
    await expect(page.getByText(/Invalid regular expression/)).toBeVisible();
    draft.rules[0].pattern = "bad";
    await page.getByLabel("Rulebook JSON").fill(JSON.stringify(draft));
    await page.getByRole("button", { name: "Validate", exact: true }).click();
    await expect(page.getByText("Rulebook JSON is strictly valid according to the compliance schema!")).toBeVisible();
    await page.getByRole("button", { name: "Save Rulebook", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved rulebook:" })).toBeVisible();
    const saved = JSON.parse(await page.getByLabel("Rulebook JSON").inputValue());
    saved.description = "Updated integration test";
    await page.getByLabel("Rulebook JSON").fill(JSON.stringify(saved));
    await page.getByRole("button", { name: "Save Rulebook", exact: true }).click();
    await expect(page.getByLabel("Rulebook JSON")).toHaveValue(/Updated integration test/);
    await page.getByRole("button", { name: "Auditor Workspace", exact: true }).click();
    await page.getByLabel("Document content").fill("bad content");
    await audit(page);
    await expect(page.locator(".finding-title")).toHaveText("Test rule");
    await page.getByRole("button", { name: "JSON Rulebook & Schema Studio" }).click();
    await page.getByRole("button", { name: "New Rulebook", exact: true }).click();
    await page.getByLabel("Rulebook JSON").fill(JSON.stringify({ name: "Inherited draft", version: "1.0.0", description: "Test", extendsRulebookId: saved.id, rules: [] }));
    await page.getByRole("button", { name: "Auditor Workspace", exact: true }).click();
    const draftScan = page.waitForResponse(response => response.url().endsWith("/api/scans") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Test with Studio Rules", exact: true }).click();
    expect((await draftScan).ok()).toBeTruthy();
    await expect(page.locator(".hint").filter({ hasText: "Inherited draft" })).toBeVisible();
    await expect(page.locator(".finding-title")).toHaveText("Test rule");
    await expect(page.locator("fieldset")).toBeEnabled();
  });

  test("uploads the same file twice and surfaces unsupported uploads and history errors", async ({ page }) => {
    await ready(page);
    for (let i = 0; i < 2; i++) {
      const response = page.waitForResponse(res => res.url().includes("/api/scans/upload") && res.request().method() === "POST");
      await page.getByLabel("Upload text document", { exact: true }).setInputFiles({ name: "frontend-e2e.md", mimeType: "text/plain", buffer: Buffer.from("Framework: React 18+\nhttp://insecure.example") });
      expect((await response).ok()).toBeTruthy();
      await expect(page.locator("fieldset")).toBeEnabled();
    }
    await page.getByLabel("Upload text document", { exact: true }).setInputFiles({ name: "binary.exe", mimeType: "application/octet-stream", buffer: Buffer.from("binary") });
    await expect(page.getByRole("alert")).toContainText("supported text file");
    await page.getByRole("button", { name: /Scan History/ }).click();
    await page.route("**/api/scans/*", route => route.fulfill({ status: 404, json: { error: "Scan not found" } }));
    await page.getByRole("button", { name: "View & Highlight" }).first().click();
    await expect(page.getByRole("alert")).toContainText("Scan not found");
  });
});

const fixtureBook = { id: "framework", name: "Open Source Framework Documentation Auditor", description: "Fixture", version: "1.0.0", rules: [] };
async function mockCatalog(page: Page) {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith("/health") ? { status: "ok" } : path.endsWith("/schema") ? { type: "object", properties: {} } : path.endsWith("/effective") ? fixtureBook : path.endsWith("/rulebooks") ? [fixtureBook] : [] });
  });
}

test("catalog failures are independent and a missing schema disables copy", async ({ page }) => {
  await mockCatalog(page);
  await page.route("**/api/scans", route => route.fulfill({ status: 503, json: { error: "History temporarily unavailable" } }));
  await page.route("**/api/rulebooks/schema", route => route.fulfill({ status: 503, json: { error: "Schema temporarily unavailable" } }));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("History temporarily unavailable");
  await expect(page.getByRole("button", { name: "Audit Document", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "JSON Rulebook & Schema Studio" }).click();
  await page.getByRole("button", { name: "Schema Spec", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy Schema", exact: true })).toBeDisabled();
});

test("rejected clipboard access shows an error without claiming success", async ({ page }) => {
  await mockCatalog(page);
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("Denied")) } }));
  await ready(page);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Clipboard access failed");
  await expect(page.getByText("Source content copied.", { exact: true })).toHaveCount(0);
});

test("rapid audit keyboard shortcuts submit only one request", async ({ page }) => {
  await mockCatalog(page);
  let scans = 0;
  await page.route("**/api/scans", async route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: [] });
    scans++;
    const body = route.request().postDataJSON();
    await new Promise(resolve => setTimeout(resolve, 150));
    return route.fulfill({ json: { id: "scan", content: body.content, sourceName: body.sourceName, sourceType: "paste", rulebookId: "framework", rulebookName: fixtureBook.name, lineCount: 63, errorCount: 0, warningCount: 0, infoCount: 0, compliant: true, createdAt: new Date().toISOString(), findings: [] } });
  });
  await ready(page);
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));
  });
  await expect(page.locator(".scorecard")).toBeVisible();
  expect(scans).toBe(1);
});

test("delete, clear-history, and reset controls send their intended requests", async ({ page }) => {
  let books = [fixtureBook];
  const record = { id: "fixture-scan", content: "Framework: React 18+", sourceName: "fixture.md", sourceType: "paste", rulebookId: "framework", rulebookName: fixtureBook.name, lineCount: 1, errorCount: 0, warningCount: 0, infoCount: 0, compliant: true, createdAt: new Date().toISOString(), findings: [] };
  let history = [record];
  const requests: string[] = [];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    requests.push(`${method} ${path}`);
    if (method === "DELETE") {
      if (path.startsWith("/api/scans")) history = [];
      if (path.startsWith("/api/rulebooks")) books = [];
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/rulebooks/reset") { books = [fixtureBook]; return route.fulfill({ json: books }); }
    return route.fulfill({ json: path.endsWith("/health") ? { status: "ok" } : path.endsWith("/schema") ? { type: "object", properties: {} } : path.endsWith("/effective") ? fixtureBook : path === "/api/rulebooks" ? books : path === "/api/scans" ? history : record });
  });
  page.on("dialog", dialog => dialog.accept());
  await ready(page);
  await page.getByRole("button", { name: /Scan History/ }).click();
  await page.getByRole("button", { name: "Delete scan fixture.md" }).click();
  await expect(page.getByText("No scans recorded yet. Run an audit from the workspace.")).toBeVisible();
  expect(requests).toContain("DELETE /api/scans/fixture-scan");
  history = [record];
  await page.getByRole("button", { name: "Refresh connection" }).click();
  await page.getByRole("button", { name: "Clear All Scans", exact: true }).click();
  await expect(page.getByText("No scans recorded yet. Run an audit from the workspace.")).toBeVisible();
  expect(requests).toContain("DELETE /api/scans");
  await page.getByRole("button", { name: "JSON Rulebook & Schema Studio" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
  expect(requests).toContain("DELETE /api/rulebooks/framework");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
  expect(requests).toContain("POST /api/rulebooks/reset");
});

test("a preset never silently uses another preset's missing rulebook", async ({ page }) => {
  await mockCatalog(page);
  await ready(page);
  await page.getByRole("button", { name: "System Audit Logs", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("preset's rulebook is unavailable");
  await expect(page.getByRole("button", { name: "Audit Document", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Compliance rulebook", { exact: true })).toHaveValue("");
});
