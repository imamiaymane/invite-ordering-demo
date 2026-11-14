import { test, expect, type Page } from "@playwright/test";
const details = (p: Page) => p.getByRole("dialog", { name: "Request details" });
const navigate = (p: Page, name: string) =>
  p.locator("nav").getByRole("button", { name, exact: true }).click();
async function countMatches(page: Page, count: number) {
  await expect(page.locator(".ordered-table tbody tr")).toHaveCount(count);
  await navigate(page, "Shared dashboard");
  await expect(
    page
      .locator(".metric")
      .filter({ has: page.locator(".metric-top", { hasText: /^Ordered$/ }) })
      .locator(".metric-count"),
  ).toHaveText(String(count));
  await page
    .locator(".metric")
    .filter({ has: page.locator(".metric-top", { hasText: /^Ordered$/ }) })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ordered", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ordered-table tbody tr")).toHaveCount(count);
}
test("Ordered navigation, filters and dashboard counts include partial arrivals", async ({
  page,
}) => {
  await page.goto("/");
  const names = await page.locator("nav button").allTextContents();
  expect(names.slice(0, 5).map((s) => s.trim())).toEqual([
    "Shared dashboard",
    "To order",
    "My requests",
    "Ordered",
    "On shelf",
  ]);
  await navigate(page, "Ordered");
  await countMatches(page, 2);
  await expect(page.locator(".ordered-table")).toContainText(
    "Inductive proximity sensors",
  );
  await expect(page.locator(".ordered-table")).toContainText(
    "Pneumatic quick connectors",
  );
  await expect(page.locator(".ordered-table")).not.toContainText(
    "Glass reactor vessels",
  );
  await page.getByLabel("Filter department").selectOption("Automation");
  await countMatches(page, 1);
  for (const term of [
    "Inductive proximity",
    "Yash Junnarkar",
    "PO-DEMO-820",
    "INV-1042",
  ]) {
    await page.getByLabel("Search", { exact: true }).fill(term);
    await countMatches(page, 1);
  }
  await page.getByLabel("Search", { exact: true }).fill("not-a-match");
  await countMatches(page, 0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await countMatches(page, 2);
  await page
    .locator(".ordered-table tbody tr")
    .first()
    .getByRole("button", { name: "Open details" })
    .click();
  await expect(details(page)).toBeVisible();
  await details(page).getByRole("button", { name: "Close details" }).click();
  await page.screenshot({
    path: "artifacts/ordered-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/ordered-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("Ordered row actions preserve partial outstanding amounts and remove fully received orders", async ({
  page,
}) => {
  await page.goto("/");
  await navigate(page, "Ordered");
  const sensors = page
    .locator(".ordered-table tbody tr")
    .filter({ hasText: "INV-1042" });
  await sensors
    .getByRole("button", { name: "Partial delivery", exact: true })
    .click();
  const shelf = page.getByRole("dialog", { name: "shelf", exact: true });
  await expect(
    shelf.getByRole("heading", { name: "Partial delivery" }),
  ).toBeVisible();
  await shelf.getByLabel("Quantity", { exact: true }).fill("2");
  await shelf.getByLabel("Shelf location").fill("A-03");
  await shelf.getByRole("button", { name: "Confirm shelf placement" }).click();
  await expect(details(page).locator(".quantity-strip")).toContainText(
    "10Ordered8Arrived4On shelf4Picked up2Still due",
  );
  await details(page).getByRole("button", { name: "Close details" }).click();
  await expect(sensors).toContainText("2 still due");
  await countMatches(page, 2);
  const connectors = page
    .locator(".ordered-table tbody tr")
    .filter({ hasText: "INV-1046" });
  await connectors
    .getByRole("button", { name: "Handed directly to requester" })
    .click();
  await page
    .getByRole("dialog", { name: "direct", exact: true })
    .getByRole("button", { name: "Confirm direct handover" })
    .click();
  await expect(details(page).locator(".badge")).toHaveText("Picked up");
  await details(page).getByRole("button", { name: "Close details" }).click();
  await expect(connectors).toHaveCount(0);
  await countMatches(page, 1);
  await sensors
    .getByRole("button", { name: "Placed on shelf", exact: true })
    .click();
  await shelf.getByLabel("Shelf location").fill("A-04");
  await shelf.getByRole("button", { name: "Confirm shelf placement" }).click();
  await expect(details(page).locator(".badge")).toHaveText("On shelf");
  await details(page).getByRole("button", { name: "Close details" }).click();
  await countMatches(page, 0);
  await navigate(page, "On shelf");
  await expect(page.locator("tbody")).toContainText(
    "Inductive proximity sensors",
  );
  await expect(page.locator("tbody")).not.toContainText(
    "Pneumatic quick connectors",
  );
  await navigate(page, "Picked up");
  await expect(page.locator("tbody")).toContainText(
    "Pneumatic quick connectors",
  );
});
test("Ordered counts requests once and hides fully received lines of a multi-item order", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Reset demo data", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "reset", exact: true })
    .getByRole("button", { name: "Reset demo data", exact: true })
    .click();
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("invite-demo-v4")!);
    const r = d.requests.find((r: { id: string }) => r.id === "INV-1042");
    r.items.push({
      ...r.items[0],
      id: "fully-received",
      name: "Fully received extra item",
      quantity: 1,
      received: 1,
      picked: 0,
      deliveries: [
        {
          quantity: 1,
          picked: 0,
          shelf: "A-05",
          at: new Date().toISOString(),
          by: "Alphin Francis",
        },
      ],
      collections: [],
    });
    localStorage.setItem("invite-demo-v4", JSON.stringify(d));
  });
  await page.reload();
  await navigate(page, "Ordered");
  await countMatches(page, 2);
  await expect(page.locator(".ordered-table")).not.toContainText(
    "Fully received extra item",
  );
  await page
    .locator(".ordered-table tbody tr")
    .filter({ hasText: "INV-1042" })
    .getByRole("button", { name: "Partial delivery", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "shelf", exact: true })
      .getByLabel("Item", { exact: true }),
  ).not.toContainText("Fully received extra item");
});
