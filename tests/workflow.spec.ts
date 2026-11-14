import { test, expect, type Page } from "@playwright/test";
import {
  initialData,
  canAct,
  decide,
  placeOrder,
  status,
  receive,
  pickup,
  handover,
  shelfQty,
  active,
  collectedRows,
} from "../src/model";
const detail = (p: Page) => p.getByRole("dialog", { name: "Request details" });
const form = (p: Page, name: string) =>
  p.getByRole("dialog", { name, exact: true });
async function close(p: Page) {
  await detail(p).getByRole("button", { name: "Close details" }).click();
}
async function person(p: Page, name: string) {
  await p.getByLabel("Sample person").selectOption(name);
}
async function item(p: Page, name: string) {
  await p
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
}
async function nav(p: Page, name: string) {
  await p.locator("nav").getByRole("button", { name, exact: true }).click();
}
test("normal shared workflow: assigned engineer approves and can order; any employee records shelf and pickup", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "New request", exact: true }).click();
  const request = form(page, "Request form");
  await expect(request.getByLabel("Purpose")).toHaveCount(0);
  await expect(request.getByLabel("Project / cost centre")).toHaveCount(0);
  await expect(request.getByLabel("Recipient", { exact: true })).toHaveCount(0);
  await request
    .getByLabel("Item name", { exact: true })
    .fill("Workflow sample sensor");
  await request.getByRole("button", { name: "Submit request" }).click();
  await expect(
    detail(page).getByText("Requested", { exact: true }),
  ).toBeVisible();
  await expect(
    detail(page).getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await close(page);
  await person(page, "Alphin Francis");
  await item(page, "Workflow sample sensor");
  await expect(
    detail(page).getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await close(page);
  await person(page, "Marius Kling");
  await item(page, "Workflow sample sensor");
  await expect(
    detail(page).getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await close(page);
  await person(page, "Jan Wiggeshoff");
  await item(page, "Workflow sample sensor");
  await detail(page)
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await form(page, "approve")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    detail(page).getByText("To order", { exact: true }),
  ).toBeVisible();
  await close(page);
  await person(page, "Marius Kling");
  await item(page, "Workflow sample sensor");
  await expect(
    detail(page).getByRole("button", { name: "Mark as ordered" }),
  ).toHaveCount(0);
  await close(page);
  await person(page, "Jan Wiggeshoff");
  await item(page, "Workflow sample sensor");
  await detail(page).getByRole("button", { name: "Mark as ordered" }).click();
  const order = form(page, "order");
  await order
    .getByLabel("Supplier", { exact: true })
    .fill("Fictional supplier");
  await order.getByLabel("Supplier order number").fill("PO-TEST-01");
  await order.getByLabel("Expected delivery date").fill("2027-12-01");
  await order.getByRole("button", { name: "Save order" }).click();
  await close(page);
  await person(page, "Marianne Baransi");
  await item(page, "Workflow sample sensor");
  await detail(page)
    .getByRole("button", { name: "Placed on shelf", exact: true })
    .click();
  await expect(
    form(page, "shelf").getByLabel("Quantity", { exact: true }),
  ).toHaveCount(0);
  await form(page, "shelf").getByLabel("Shelf location").fill("T-01");
  await form(page, "shelf")
    .getByRole("button", { name: "Confirm shelf placement" })
    .click();
  await expect(
    detail(page).getByText("On shelf", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    detail(page)
      .locator(".timeline>div")
      .filter({ hasText: "Placed on shelf: 1" }),
  ).toContainText("Marianne Baransi");
  await close(page);
  await person(page, "Alphin Francis");
  await nav(page, "On shelf");
  await item(page, "Workflow sample sensor");
  await detail(page)
    .getByRole("button", { name: "Picked up", exact: true })
    .click();
  await expect(form(page, "pickup").getByLabel("Collected by")).toHaveValue(
    "Yash Junnarkar",
  );
  await form(page, "pickup")
    .getByRole("button", { name: "Confirm pickup" })
    .click();
  await expect(detail(page).locator(".badge")).toHaveText("Picked up");
  await expect(
    detail(page)
      .locator(".timeline>div")
      .filter({ hasText: "Yash Junnarkar collected 1" }),
  ).toContainText("Alphin Francis");
  await close(page);
  await expect(page.locator("tbody")).not.toContainText(
    "Workflow sample sensor",
  );
  await nav(page, "Picked up");
  await expect(page.locator("tbody")).toContainText("Workflow sample sensor");
  await expect(page.locator("tbody")).toContainText("Alphin Francis");
  await page.reload();
  await nav(page, "Picked up");
  await item(page, "Workflow sample sensor");
  await expect(detail(page).locator(".badge")).toHaveText("Picked up");
  expect(errors).toEqual([]);
});
test("direct handover skips shelf and records arrival and collection together", async ({
  page,
}) => {
  await page.goto("/");
  await person(page, "Alphin Francis");
  await item(page, "Pneumatic quick connectors");
  await detail(page)
    .getByRole("button", { name: "Handed directly to requester" })
    .click();
  await expect(form(page, "direct")).toContainText("Marianne Baransi");
  await expect(form(page, "direct").getByLabel("Shelf location")).toHaveCount(
    0,
  );
  await form(page, "direct")
    .getByRole("button", { name: "Confirm direct handover" })
    .click();
  await expect(detail(page).locator(".badge")).toHaveText("Picked up");
  await expect(detail(page).locator(".quantity-strip")).toContainText(
    "12Ordered12Arrived0On shelf12Picked up0Still due",
  );
  await expect(detail(page).locator(".timeline")).toContainText(
    "Handed directly to Marianne Baransi",
  );
  await close(page);
  await nav(page, "On shelf");
  await expect(page.locator("tbody")).not.toContainText(
    "Pneumatic quick connectors",
  );
  await nav(page, "Picked up");
  const row = page
    .locator("tbody tr")
    .filter({ hasText: "Pneumatic quick connectors" });
  await expect(row).toContainText("Direct handover");
  await expect(row).toContainText("Alphin Francis");
  await expect(row).toContainText("Marianne Baransi");
});
test("partial quantities and unidentified parcels remain available to any employee across departments", async ({
  page,
}) => {
  await page.goto("/");
  await person(page, "Marianne Baransi");
  await item(page, "Inductive proximity sensors");
  await detail(page)
    .getByRole("button", { name: "Placed on shelf", exact: true })
    .click();
  await form(page, "shelf").getByLabel("Record a partial quantity").check();
  await form(page, "shelf").getByLabel("Quantity", { exact: true }).fill("2");
  await form(page, "shelf").getByLabel("Shelf location").fill("A-03");
  await form(page, "shelf")
    .getByRole("button", { name: "Confirm shelf placement" })
    .click();
  await expect(detail(page).locator(".quantity-strip")).toContainText(
    "10Ordered8Arrived4On shelf4Picked up2Still due",
  );
  await close(page);
  await nav(page, "Unidentified parcels");
  await page.getByRole("button", { name: "Register parcel" }).click();
  await form(page, "parcel")
    .getByLabel("Parcel description")
    .fill("Fictional actuator parcel");
  await form(page, "parcel").getByLabel("Shelf location").fill("U-03");
  await form(page, "parcel")
    .getByRole("button", { name: "Register parcel", exact: true })
    .click();
  const card = page
    .locator(".parcel-card")
    .filter({ hasText: "Fictional actuator parcel" });
  await expect(card).toContainText("Marianne Baransi");
  await card.getByRole("button", { name: "Match to an order" }).click();
  const match = page.getByRole("dialog", { name: /match:/ });
  await match.getByLabel("Match order").selectOption("INV-1046");
  await match.getByLabel("Record a partial quantity").check();
  await match.getByLabel("Quantity", { exact: true }).fill("3");
  await match.getByRole("button", { name: "Match & place on shelf" }).click();
  await expect(card).toHaveCount(0);
  await nav(page, "On shelf");
  await item(page, "Pneumatic quick connectors");
  await expect(detail(page).locator(".quantity-strip")).toContainText(
    "12Ordered3Arrived3On shelf0Picked up9Still due",
  );
  await expect(detail(page)).toContainText("U-03");
  await expect(detail(page).locator(".timeline")).toContainText("Marianne Baransi");
});
test("30-day collections view retains older records and excludes completed orders from active lists", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("tbody")).not.toContainText(
    "Archived sample pipette stand",
  );
  await expect(page.locator("tbody")).not.toContainText(
    "Calibration reference weights",
  );
  await nav(page, "Picked up");
  await expect(page.locator("tbody")).toContainText(
    "Calibration reference weights",
  );
  await expect(page.locator("tbody")).not.toContainText(
    "Archived sample pipette stand",
  );
  await page.getByRole("button", { name: "View older records" }).click();
  await expect(page.locator("tbody")).toContainText(
    "Archived sample pipette stand",
  );
  await item(page, "Archived sample pipette stand");
  await expect(detail(page).locator(".timeline")).toContainText("Picked up");
  await expect(detail(page).locator(".timeline>div")).toHaveCount(5);
  await close(page);
  await page.getByRole("button", { name: "Back to last 30 days" }).click();
  await expect(page.locator("tbody")).not.toContainText(
    "Archived sample pipette stand",
  );
});
test("shared view, engineer-created request, optional recipient, reply and rejection", async ({
  page,
}) => {
  await page.goto("/");
  const count = await page.locator("tbody tr").count();
  await person(page, "Jan Wiggeshoff");
  await expect(page.locator("tbody tr")).toHaveCount(count);
  await expect(page.locator("tbody")).toContainText("Robotics");
  await expect(page.locator("tbody")).toContainText("Formulation Technology");
  await page.getByRole("button", { name: "New request", exact: true }).click();
  const request = form(page, "Request form");
  await request.getByLabel("Ordering for someone else").check();
  await request
    .getByLabel("Recipient", { exact: true })
    .selectOption("Alphin Francis");
  await request.getByLabel("Department").selectOption("Robotics");
  await request
    .getByLabel("Item name", { exact: true })
    .fill("Engineer-created sample");
  await request.getByRole("button", { name: "Submit request" }).click();
  await expect(detail(page).locator(".detail-people")).toContainText(
    "Jan Wiggeshoff",
  );
  await expect(detail(page).locator(".detail-people")).toContainText(
    "Alphin Francis",
  );
  await expect(
    detail(page).getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await close(page);
  await person(page, "Marius Kling");
  await item(page, "Engineer-created sample");
  await detail(page).getByRole("button", { name: "Request changes" }).click();
  await form(page, "changes")
    .getByLabel("What needs to change?")
    .fill("Please confirm the item size.");
  await form(page, "changes")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await close(page);
  await person(page, "Jan Wiggeshoff");
  await item(page, "Engineer-created sample");
  await detail(page).getByRole("button", { name: "Reply to engineer" }).click();
  await request.getByLabel("Your reply").fill("The required size is 20 mm.");
  await request.getByRole("button", { name: "Send reply & resubmit" }).click();
  await expect(detail(page).locator(".badge")).toHaveText("Requested");
  await expect(
    detail(page).getByRole("button", { name: "Add comment" }),
  ).toHaveCount(0);
  await close(page);
  await person(page, "Marius Kling");
  await item(page, "Engineer-created sample");
  await detail(page)
    .getByRole("button", { name: "Reject", exact: true })
    .click();
  await form(page, "reject")
    .getByLabel("Reason for rejection")
    .fill("Use the existing stock.");
  await form(page, "reject")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(detail(page).locator(".badge")).toHaveText("Rejected");
  await close(page);
  await expect(page.locator("tbody")).not.toContainText(
    "Engineer-created sample",
  );
  await page.getByLabel("Filter status").selectOption("Rejected");
  await expect(page.locator("tbody")).toContainText("Engineer-created sample");
});
test("readable desktop and mobile review screenshots", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".brand")).toHaveCount(0);
  await expect(page.locator(".demo-note")).toHaveCount(0);
  await page.locator("tbody tr").first().locator("td").nth(3).click();
  await expect(detail(page)).toBeVisible();
  await close(page);
  await page
    .getByRole("button", { name: "Open INV-1042", exact: true })
    .click();
  await expect(detail(page)).toBeVisible();
  await close(page);
  await page.screenshot({
    path: "artifacts/shared-dashboard-desktop.png",
    fullPage: true,
  });
  expect(
    await page
      .locator("td")
      .first()
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(14);
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page.screenshot({ path: "artifacts/simple-request-form.png" });
  await page.keyboard.press("Escape");
  await item(page, "Pneumatic quick connectors");
  await page.screenshot({ path: "artifacts/shared-order-actions.png" });
  await detail(page)
    .getByRole("button", { name: "Handed directly to requester" })
    .click();
  await page.screenshot({ path: "artifacts/direct-handover-form.png" });
  await page.keyboard.press("Escape");
  await close(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/shared-dashboard-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page.screenshot({ path: "artifacts/simple-request-mobile.png" });
  expect(
    await page
      .locator(".modal")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBeTruthy();
});
test("model enforces assigned engineer and quantity invariants, exact 30-day boundary and fractional units", () => {
  const data = initialData(),
    r = data.requests.find(
      (r) => r.stage === "Requested" && r.department === "Robotics",
    )!;
  expect(canAct(r, "Jan Wiggeshoff", "approve")).toBeFalsy();
  expect(() => decide(r, "Jan Wiggeshoff", "approve")).toThrow();
  expect(() => decide(r, "Yash Junnarkar", "approve")).toThrow();
  const approved = decide(r, "Marius Kling", "approve");
  expect(() =>
    placeOrder(approved, "Jan Wiggeshoff", {
      supplier: "Demo",
      reference: "PO",
      orderedAt: "2026-09-27",
      expected: "",
    }),
  ).toThrow();
  let partial = data.requests[0];
  expect(() =>
    handover(partial, partial.items[0].id, 5, "Alphin Francis"),
  ).toThrow();
  expect(() =>
    pickup(partial, partial.items[0].id, 3, "Yash Junnarkar", "Alphin Francis"),
  ).toThrow();
  partial = handover(partial, partial.items[0].id, 4, "Alphin Francis");
  expect(status(partial)).toBe("On shelf");
  expect(shelfQty(partial)).toBe(2);
  partial = pickup(partial, partial.items[0].id, 2, "Yash Junnarkar", "Marianne Baransi");
  expect(status(partial)).toBe("Picked up");
  expect(active(partial)).toBeFalsy();
  const now = Date.parse("2026-10-30T12:00:00Z");
  const record = data.requests[9];
  record.items[0].collections[0].at = new Date(
    now - 30 * 86400000,
  ).toISOString();
  expect(collectedRows([record], false, now)).toHaveLength(1);
  expect(collectedRows([record], false, now + 1)).toHaveLength(0);
  expect(collectedRows([record], true, now + 1)).toHaveLength(1);
  expect(record.history.length).toBeGreaterThan(0);
  let fractional = {
    ...data.requests[4],
    items: [{ ...data.requests[4].items[0], quantity: 0.3, unit: "m" }],
  };
  fractional = receive(
    fractional,
    fractional.items[0].id,
    0.1,
    "A-01",
    "Alphin Francis",
  );
  fractional = receive(
    fractional,
    fractional.items[0].id,
    0.2,
    "A-02",
    "Alphin Francis",
  );
  fractional = pickup(
    fractional,
    fractional.items[0].id,
    0.3,
    "Yash Junnarkar",
    "Marianne Baransi",
  );
  expect(status(fractional)).toBe("Picked up");
});
