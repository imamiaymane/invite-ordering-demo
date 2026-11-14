import {
  infoUsers,
  managementUsers,
  adminUsers,
  canConfigureRoles,
} from "../src/departmentRoles";
import { test, expect, type Page } from "@playwright/test";
import {
  initialData,
  decide,
  placeOrder,
  canAct,
  status,
  active,
  recentRejection,
  departmentRoles,
} from "../src/model";
import { correctStatus } from "../src/corrections";
const detail = (p: Page) => p.getByRole("dialog", { name: "Request details" });
const nav = (p: Page, n: string) =>
  p.locator("nav").getByRole("button", { name: n, exact: true }).click();
const person = (p: Page, n: string) =>
  p.getByLabel("Sample person").selectOption(n);
const open = (p: Page, n: string) =>
  p
    .getByRole("button", { name: new RegExp(n) })
    .first()
    .click();
const close = (p: Page) =>
  detail(p).getByRole("button", { name: "Close details" }).click();
test("engineer approves, info user orders with quantities and note", async ({
  page,
}) => {
  await page.goto("/");
  await person(page, "Jan Wiggeshoff");
  await open(page, "USB programming cable");
  await detail(page)
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "approve", exact: true })
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(detail(page).locator(".badge")).toHaveText("To order");
  await expect(
    detail(page).getByRole("button", { name: "Mark as ordered" }),
  ).toBeVisible();
  await close(page);
  await nav(page, "To order");
  await expect(page.locator("tbody")).toContainText("USB programming cable");
  await page.getByLabel("Filter department").selectOption("Automation");
  await page.getByLabel("Search", { exact: true }).fill("USB");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await person(page, "Marianne Baransi");
  await open(page, "USB programming cable");
  await expect(
    detail(page).getByRole("button", { name: "Mark as ordered" }),
  ).toHaveCount(0);
  await close(page);
  await person(page, "Elham Moghaddamas");
  await open(page, "USB programming cable");
  await detail(page).getByRole("button", { name: "Mark as ordered" }).click();
  const form = page.getByRole("dialog", { name: "order", exact: true });
  await form
    .getByLabel("Supplier", { exact: true })
    .fill("Sample cable supplier");
  await form.getByLabel("Supplier order number").fill("DEMO-ROLE-1");
  await form.getByLabel("Expected delivery date").fill("2027-01-20");
  await form.getByLabel(/Ordered quantity/).fill("3");
  await form
    .getByLabel("Order comment (optional)")
    .fill("Supplier pack contains three cables.");
  await form.getByRole("button", { name: "Save order" }).click();
  await expect(detail(page).locator(".badge")).toHaveText("Ordered");
  await expect(detail(page)).toContainText("1 pcs requested · 3 pcs ordered");
  await expect(detail(page)).toContainText(
    "Supplier pack contains three cables.",
  );
  await expect(
    detail(page).locator(".timeline>div").filter({ hasText: "DEMO-ROLE-1" }),
  ).toContainText("Elham Moghaddamas");
  await close(page);
  await nav(page, "Ordered");
  await expect(page.locator(".ordered-table")).toContainText("DEMO-ROLE-1");
  await expect(page.locator(".ordered-table")).toContainText("3 pcs");
});
test("correction is restricted, requires confirmation, and retains before values", async ({
  page,
}) => {
  await page.goto("/");
  await open(page, "Inductive proximity sensors");
  await expect(
    detail(page).getByRole("button", { name: "Correct status" }),
  ).toHaveCount(0);
  await close(page);
  await person(page, "Marius Kling");
  await open(page, "Inductive proximity sensors");
  await expect(
    detail(page).getByRole("button", { name: "Correct status" }),
  ).toHaveCount(0);
  await close(page);
  await person(page, "Jan Wiggeshoff");
  await open(page, "Inductive proximity sensors");
  await detail(page).getByRole("button", { name: "Correct status" }).click();
  const correction = page.getByRole("dialog", { name: "correct", exact: true });
  await correction.getByLabel("Return to status").selectOption("Ordered");
  await correction
    .getByLabel("Correction reason")
    .fill("Arrival was recorded against the wrong order.");
  await correction
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(correction).toBeVisible();
  await correction.getByRole("checkbox").check();
  await correction
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(detail(page).locator(".badge")).toHaveText("Ordered");
  await expect(detail(page).locator(".quantity-strip")).toContainText(
    "10Ordered0Arrived0On shelf0Picked up10Still due",
  );
  await detail(page).getByText("Previous values retained").click();
  await expect(detail(page).locator(".audit-snapshot")).toContainText(
    "6 arrived, 4 picked up",
  );
  await expect(detail(page).locator(".timeline")).toContainText(
    "Arrival was recorded against the wrong order.",
  );
  await page.reload();
  await open(page, "Inductive proximity sensors");
  await expect(detail(page).locator(".timeline")).toContainText(
    "Status corrected",
  );
  await close(page);
  await person(page, "Aymane Elimami");
  await open(page, "Robot gripper fingers");
  await expect(
    detail(page).getByRole("button", { name: "Approve", exact: true }),
  ).toBeVisible();
  await expect(
    detail(page).getByRole("button", { name: "Correct status" }),
  ).toBeVisible();
});
test("rejected visibility follows 15-day cutoff in dashboard and personal view", async ({
  page,
}) => {
  await page.goto("/");
  await person(page, "Jan Wiggeshoff");
  await open(page, "USB programming cable");
  await detail(page)
    .getByRole("button", { name: "Reject", exact: true })
    .click();
  const reject = page.getByRole("dialog", { name: "reject", exact: true });
  await reject.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(reject).toBeVisible();
  await reject
    .getByLabel("Reason for rejection")
    .fill("Already available in our stock.");
  await reject.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(detail(page)).toContainText("Already available in our stock.");
  await close(page);
  await expect(page.locator("tbody")).not.toContainText(
    "USB programming cable",
  );
  await page.getByLabel("Filter status").selectOption("Rejected");
  await expect(page.locator("tbody")).toContainText("USB programming cable");
  await person(page, "Yash Junnarkar");
  await nav(page, "My requests");
  await expect(page.locator("tbody")).toContainText("USB programming cable");
  await page.getByLabel("Filter status").selectOption("Rejected");
  await expect(page.locator("tbody")).toContainText("USB programming cable");
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("invite-demo-v4")!);
    d.requests.find((r: { id: string }) => r.id === "INV-1054").rejectedAt =
      new Date(Date.now() - 16 * 86400000).toISOString();
    localStorage.setItem("invite-demo-v4", JSON.stringify(d));
  });
  await page.reload();
  await expect(page.locator("tbody")).not.toContainText(
    "USB programming cable",
  );
  await page.getByLabel("Filter status").selectOption("Rejected");
  await expect(page.locator("tbody")).not.toContainText(
    "USB programming cable",
  );
  await page
    .getByRole("button", { name: "View older rejected records" })
    .click();
  await expect(page.locator("tbody")).toContainText("USB programming cable");
  await open(page, "USB programming cable");
  await expect(detail(page).locator(".timeline")).toContainText(
    "Already available in our stock.",
  );
});
test("model guards split roles, corrections and rejection expiry without deleting history", () => {
  const data = initialData(),
    r = data.requests.find((r) => r.id === "INV-1054")!;
  expect(() => decide(r, "Alphin Francis", "approve")).toThrow();
  const approved = decide(r, "Jan Wiggeshoff", "approve");
  const fields = {
    supplier: "Demo",
    reference: "PO-1",
    orderedAt: "2026-09-29",
    expected: "2026-10-01",
    quantities: { [r.items[0].id]: 2 },
    comment: "Pack size",
  };
  expect(() => placeOrder(approved, "Jan Wiggeshoff", fields)).not.toThrow();
  expect(() => placeOrder(approved, "Alphin Francis", fields)).toThrow();
  expect(() => placeOrder(approved, "Marianne Baransi", fields)).toThrow();
  const ordered = placeOrder(approved, "Elham Moghaddamas", fields);
  expect(ordered.items[0].quantity).toBe(2);
  expect(ordered.items[0].requestedQuantity).toBe(1);
  expect(canAct(ordered, "Carl-Helmut Coulon", "order")).toBeFalsy();
  expect(() =>
    correctStatus(ordered, "Alphin Francis", "To order", "Mistake"),
  ).toThrow();
  expect(() => correctStatus(ordered, "Jan Wiggeshoff", "To order", "")).toThrow();
  const restored = correctStatus(
    ordered,
    "Jan Wiggeshoff",
    "To order",
    "Wrong supplier order.",
  );
  expect(status(restored)).toBe("To order");
  expect(restored.items[0].quantity).toBe(1);
  expect(restored.history.at(-1)?.before?.items[0].quantity).toBe(2);
  const collected = data.requests[9];
  const shelf = correctStatus(
    collected,
    "Carl-Helmut Coulon",
    "On shelf",
    "Handed over entry was incorrect.",
    "B-08",
  );
  expect(status(shelf)).toBe("On shelf");
  expect(shelf.items[0].collections).toHaveLength(0);
  expect(shelf.history.at(-1)?.before?.items[0].collections).toHaveLength(1);
  const rejected = decide(r, "Jan Wiggeshoff", "reject", "Existing stock");
  const at = Date.parse(rejected.rejectedAt!);
  expect(active(rejected, at + 15 * 86400000 - 1)).toBeTruthy();
  expect(recentRejection(rejected, at + 15 * 86400000)).toBeFalsy();
  expect(active(rejected, at + 15 * 86400000)).toBeFalsy();
  expect(rejected.history.at(-1)?.text).toContain("Existing stock");
});

test("info orders across departments while engineers order only for their own department", () => {
  const base = initialData().requests[0];
  for (const role of departmentRoles) {
    const requested = {
      ...base,
      department: role.department,
      stage: "Requested" as const,
    };
    const approved = { ...requested, stage: "Approved" as const };
    expect(canAct(requested, "Elham Moghaddamas", "approve")).toBeFalsy();
    expect(canAct(requested, "Elham Moghaddamas", "reject")).toBeFalsy();
    expect(canAct(requested, "Elham Moghaddamas", "order")).toBeFalsy();
    expect(canAct(approved, "Elham Moghaddamas", "order")).toBeTruthy();
    expect(canAct(approved, role.engineers[0], "order")).toBeTruthy();
    for (const other of departmentRoles.filter(
      (r) => r.department !== role.department,
    )) {
      expect(canAct(approved, other.engineers[0], "order")).toBeFalsy();
    }
    for (const employee of ["Alphin Francis", "Marianne Baransi", "Yash Junnarkar"]) {
      expect(canAct(approved, employee, "order")).toBeFalsy();
    }
    expect(
      canAct({ ...approved, stage: "Ordered" }, "Elham Moghaddamas", "order"),
    ).toBeFalsy();
  }
});

test("info banner counts all departments, opens the complete queue and hides when empty", async ({
  page,
}) => {
  await page.goto("/");
  const banner = page.getByLabel("Orders waiting for info");
  await expect(banner).toHaveCount(0);
  await expect(page.locator(".rejected-filter")).toHaveCount(0);
  await expect(page.locator("tbody")).not.toContainText(
    "Legacy controller adapter",
  );
  await person(page, "Jan Wiggeshoff");
  await expect(
    page.getByRole("button", { name: "Review requests" }),
  ).toBeVisible();
  await expect(banner).toHaveCount(0);
  await person(page, "Elham Moghaddamas");
  await expect(banner).toContainText("2 requests need to be ordered");
  await page.getByLabel("Filter department").selectOption("Robotics");
  await page.getByLabel("Search", { exact: true }).fill("no match");
  await expect(banner).toContainText("2 requests need to be ordered");
  await banner.getByRole("button", { name: "Review orders" }).click();
  await expect(
    page.getByRole("heading", { name: "To order", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Filter department")).toHaveValue(
    "All departments",
  );
  await expect(page.getByLabel("Search", { exact: true })).toHaveValue("");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.evaluate((d) => {
    d.requests = d.requests.filter(
      (r: { stage: string }) => r.stage !== "Approved",
    );
    localStorage.setItem("invite-demo-v4", JSON.stringify(d));
  }, initialData());
  await page.reload();
  await person(page, "Elham Moghaddamas");
  await expect(banner).toHaveCount(0);
});

test("expanded roles enforce department boundaries, global decisions, ordering and configuration", () => {
  const base = initialData().requests[0];
  for (const role of departmentRoles) {
    const requested = {
      ...base,
      department: role.department,
      stage: "Requested" as const,
    };
    const approved = { ...requested, stage: "Approved" as const };
    for (const engineer of role.engineers) {
      for (const action of ["approve", "reject", "changes", "correct"])
        expect(canAct(requested, engineer, action)).toBeTruthy();
      expect(canAct(approved, engineer, "order")).toBeTruthy();
      for (const other of departmentRoles.filter(
        (r) => r.department !== role.department,
      )) {
        for (const action of [
          "approve",
          "reject",
          "changes",
          "correct",
          "order",
        ])
          expect(
            canAct(
              {
                ...requested,
                department: other.department,
                stage: action === "order" ? "Approved" : "Requested",
              },
              engineer,
              action,
            ),
          ).toBeFalsy();
      }
    }
    for (const { person } of [...managementUsers, ...adminUsers]) {
      for (const action of ["approve", "reject", "changes", "correct"])
        expect(canAct(requested, person, action)).toBeTruthy();
      expect(canAct(approved, person, "order")).toBeTruthy();
      expect(canAct(requested, person, "order")).toBeFalsy();
    }
    for (const { person } of infoUsers) {
      expect(canAct(approved, person, "order")).toBeTruthy();
      for (const action of ["approve", "reject", "changes", "correct"])
        expect(canAct(requested, person, action)).toBeFalsy();
    }
  }
  expect(canConfigureRoles("Aymane Elimami")).toBeTruthy();
  for (const { person } of [...managementUsers, ...infoUsers])
    expect(canConfigureRoles(person)).toBeFalsy();
  for (const rows of [infoUsers, managementUsers, adminUsers]) {
    const row = rows[0];
    row.enabled = false;
    try {
      expect(
        canAct({ ...base, stage: "Approved" }, row.person, "order"),
      ).toBeFalsy();
    } finally {
      row.enabled = true;
    }
  }
});
test("engineer, management, admin and info people receive appropriate UI actions", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of ["Jan Wiggeshoff", "Carl-Helmut Coulon", "Aymane Elimami"]) {
    await person(page, name);
    await open(page, "USB programming cable");
    for (const action of [
      "Approve",
      "Reject",
      "Request changes",
      "Correct status",
    ])
      await expect(
        detail(page).getByRole("button", { name: action, exact: true }),
      ).toBeVisible();
    await close(page);
  }
  await person(page, "Marius Kling");
  await open(page, "USB programming cable");
  await expect(
    detail(page).getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await close(page);
  for (const name of ["Elham Moghaddamas", "Kamila Kalkin"]) {
    await person(page, name);
    await expect(page.getByLabel("Orders waiting for info")).toContainText(
      "2 requests need to be ordered",
    );
    await open(page, "DIN rail power supply");
    await expect(
      detail(page).getByRole("button", { name: "Mark as ordered" }),
    ).toBeVisible();
    await expect(
      detail(page).getByRole("button", { name: "Correct status" }),
    ).toHaveCount(0);
    await close(page);
  }
});
