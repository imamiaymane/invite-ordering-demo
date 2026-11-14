import { test, expect, chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  SITE_URL,
  lists,
  statuses,
  departments,
  type ListKey,
  type Row,
  type RequestRow,
} from "../src/config";
import { schema } from "../src/schema";
import { SharePointClient, type Fetcher } from "../src/client";
import { SharePointRepository, fieldTypeError } from "../src/repository";
import { WorkflowService } from "../src/workflow";
import { allowed, readRoles } from "../src/roles";
const keys = Object.keys(lists) as ListKey[];
const origin = new URL(SITE_URL).origin;
test("built diagnostic renders in a mock authenticated browser using GET only", async () => {
  const f = fixture();
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    const page = await browser.newPage();
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (req.url() === SITE_URL) {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<html><body><h1>Mock DEV page — no live SharePoint access</h1></body></html>",
        });
        return;
      }
      const response = await f.fetcher(req.url(), {
        method: req.method(),
        body: req.postData(),
      });
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: await response.text(),
      });
    });
    await page.goto(SITE_URL);
    await page.evaluate(
      readFileSync("sharepoint/dist/read-only-test.js", "utf8"),
    );
    await expect(page.locator("#invite-readonly-probe pre")).toContainText(
      "PASS — current user, list reads, schema and roles verified.",
    );
    await expect(page.locator("#invite-readonly-probe pre")).toContainText(
      "Info ordering: true",
    );
    await expect(page.locator("#invite-readonly-probe pre")).toContainText(
      "Writes remain DISABLED",
    );
    expect(f.state.calls.every((c) => c.method === "GET")).toBeTruthy();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator("#invite-readonly-probe")).toHaveCount(0);
  } finally {
    await browser.close();
  }
});
function fixture() {
  const db = Object.fromEntries(keys.map((k) => [k, []])) as Record<
    ListKey,
    Row[]
  >;
  db.engineers = departments.map((Title, i) => ({
    Id: i + 1,
    Title,
    EngineersId: [7, 20 + i],
    EngineerId: 999,
  }));
  db.info = [
    { Id: 1, Title: "info", OrderingUserId: 7, IsEnabled: true },
    { Id: 2, Title: "info", OrderingUserId: 31, IsEnabled: true },
  ];
  db.management = [
    { Id: 1, Title: "Management", ManagementUserId: 7, IsEnabled: true },
    { Id: 2, Title: "Management", ManagementUserId: 41, IsEnabled: true },
  ];
  db.admins = [{ Id: 1, Title: "Admin", AdminUserId: 7, IsEnabled: true }];
  const state = {
    user: 7,
    missingList: "",
    missingField: "",
    legacyOnly: false,
    stale: false,
    engineersAsUser: false,
    engineersMetadata: {} as Record<string, unknown>,
    calls: [] as { method: string; url: string; body?: any }[],
  };
  const lookup: Record<string, ListKey> = {
    "items.Request": "requests",
    "lots.RequestItem": "items",
    "history.Request": "requests",
    "history.RequestItem": "items",
    "history.DeliveryLot": "lots",
    "history.Parcel": "parcels",
    "parcels.MatchedRequestItem": "items",
    "parcels.MatchedDeliveryLot": "lots",
  };
  const choices: Record<string, readonly string[]> = {
    RequestStatus: statuses,
    PreviousStatus: statuses,
    NewStatus: statuses,
    Department: departments,
    ArrivalMethod: ["On shelf", "Direct handover"],
    ParcelStatus: ["Unidentified", "Matched"],
    ActionType: [
      "Requested",
      "Approved",
      "Rejected",
      "Changes requested",
      "Requester replied",
      "Ordered",
      "Placed on shelf",
      "Direct handover",
      "Picked up",
      "Status corrected",
      "Parcel reported",
      "Parcel matched",
    ],
  };
  const response = (body: any, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ETag: '"1"' },
    });
  const fetcher: Fetcher = async (url, init = {}) => {
    const method = init.method ?? "GET",
      body = init.body ? JSON.parse(String(init.body)) : undefined;
    state.calls.push({ method, url, body });
    const u = new URL(url);
    if (url.includes("/currentuser"))
      return response({
        Id: state.user,
        Title: "Aymane El Imami",
        Email: "test@example.com",
        LoginName: `claims|${state.user}`,
      });
    if (url.includes("/contextinfo"))
      return response({
        FormDigestValue: "mock-digest",
        FormDigestTimeoutSeconds: 1800,
      });
    const title = decodeURIComponent(u.pathname).match(
      /getbytitle\('([^']+)'\)/,
    )?.[1];
    const key = keys.find((k) => lists[k] === title);
    if (!key || state.missingList === key) return response({}, 404);
    const base = decodeURIComponent(u.pathname);
    if (base.includes("/fields")) {
      const fields = Object.entries(schema[key])
        .filter(
          ([n]) =>
            n !== state.missingField &&
            !(state.legacyOnly && n === "Engineers"),
        )
        .map(([InternalName, TypeAsString]) => ({
          InternalName,
          TypeAsString:
            InternalName === "Engineers" && state.engineersAsUser
              ? "User"
              : TypeAsString,
          ReadOnlyField: false,
          Choices: choices[InternalName],
          LookupList: lookup[`${key}.${InternalName}`]
            ? `guid-${lookup[`${key}.${InternalName}`]}`
            : undefined,
        }));
      const name = base.match(/getbyinternalnameortitle\('([^']+)'\)/)?.[1];
      const field = fields.find((f) => f.InternalName === name);
      return response(
        name
          ? name === "Engineers" && field
            ? { ...field, ...state.engineersMetadata }
            : field
          : { value: fields },
      );
    }
    if (!base.includes("/items"))
      return response({ Id: `guid-${key}`, Title: title });
    const id = Number(base.match(/items\((\d+)\)/)?.[1] ?? 0);
    if (method === "POST") {
      if (id) {
        if (state.stale) return response({}, 412);
        Object.assign(
          db[key].find((r) => r.Id === id)!,
          body,
        );
        return response(null, 204);
      }
      const row = { Id: db[key].length + 1, ...body };
      db[key].push(row);
      return response(row, 201);
    }
    if (id) return response(db[key].find((r) => r.Id === id));
    const filter = u.searchParams.get("$filter")?.match(/(\w+) eq (\d+)/);
    const rows = filter
      ? db[key].filter((r) => r[filter[1]] === Number(filter[2]))
      : db[key];
    return response({ value: rows });
  };
  return {
    db,
    state,
    fetcher,
    repo: (writes = false) =>
      new SharePointRepository(new SharePointClient(fetcher, origin), writes),
  };
}
test("probe reads all nine lists and real identity using only GET, ignoring legacy Engineer", async () => {
  const f = fixture(),
    repo = f.repo(),
    result = await repo.probe();
  expect(result.passed).toBeTruthy();
  expect(result.lists).toHaveLength(9);
  expect(result.user?.Id).toBe(7);
  expect(result.roles?.departmentEngineers.Automation).toEqual([7, 20]);
  expect(result.roles?.departmentEngineers.Automation).not.toContain(999);
  expect(result.roles?.info).toEqual([7, 31]);
  expect(result.writesEnabled).toBe(false);
  expect(f.state.calls.every((c) => c.method === "GET")).toBeTruthy();
  await expect(
    repo.create("requests", { Title: "Must not write" }),
  ).rejects.toThrow("Writes disabled");
  expect(f.db.requests).toHaveLength(0);
});
test("missing internal Engineers fails even with legacy Engineer; missing list and schema fail closed", async () => {
  for (const failure of [
    "legacyOnly",
    "missingList",
    "missingField",
  ] as const) {
    const f = fixture();
    if (failure === "legacyOnly") f.state.legacyOnly = true;
    if (failure === "missingList") f.state.missingList = "history";
    if (failure === "missingField") f.state.missingField = "OrderingUser";
    const repo = f.repo(true);
    expect((await repo.probe()).passed).toBeFalsy();
    await expect(repo.create("requests", { Title: "Blocked" })).rejects.toThrow(
      "Writes disabled",
    );
    expect(f.state.calls.every((c) => c.method === "GET")).toBeTruthy();
  }
});
test("permissions use IDs and enabled roles, not matching display names or labels", () => {
  const f = fixture(),
    roles = readRoles(f.db.engineers, f.db.info, f.db.management, f.db.admins);
  const request = {
    Id: 1,
    Title: "Test",
    RequestStatus: "Requested",
    Department: "Automation",
    RequesterId: 100,
    RecipientId: 100,
  } as RequestRow;
  const user = (Id: number) => ({
    Id,
    Title: "Aymane El Imami",
    Email: "",
    LoginName: `claims|${Id}`,
  });
  for (const id of [7, 20, 41])
    for (const action of ["approve", "reject", "changes", "correct"] as const)
      expect(allowed(user(id), roles, action, request)).toBeTruthy();
  for (const id of [31, 21, 999, 100])
    expect(allowed(user(id), roles, "approve", request)).toBeFalsy();
  expect(
    allowed(user(31), roles, "order", {
      ...request,
      RequestStatus: "To order",
    }),
  ).toBeTruthy();
  expect(allowed(user(31), roles, "order", request)).toBeFalsy();
  expect(allowed(user(41), roles, "configure")).toBeFalsy();
  expect(allowed(user(7), roles, "configure")).toBeTruthy();
  f.db.info[1].IsEnabled = false;
  expect(
    readRoles(f.db.engineers, f.db.info, f.db.management, f.db.admins).info,
  ).toEqual([7]);
});
test("transport fails on localhost, foreign pagination, login HTML, unauthorized and stale writes", async () => {
  const f = fixture();
  await expect(
    new SharePointClient(f.fetcher, "http://localhost:5173").get(
      "web/currentuser",
    ),
  ).rejects.toThrow("signed-in");
  const foreign: Fetcher = async () =>
    new Response(
      JSON.stringify({
        value: [],
        "odata.nextLink": "https://evil.example/_api/web",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  await expect(
    new SharePointClient(foreign, origin).all("web/items"),
  ).rejects.toThrow("outside");
  await expect(
    new SharePointClient(async () => new Response("login"), origin).get("web"),
  ).rejects.toThrow("non-JSON");
  await expect(
    new SharePointClient(
      async () => new Response("", { status: 403 }),
      origin,
    ).get("web"),
  ).rejects.toThrow("Access denied");
  const repo = f.repo(true);
  await expect(repo.create("requests", { Title: "No probe" })).rejects.toThrow(
    "Writes disabled",
  );
  await repo.probe();
  const r = await repo.create("requests", { Title: "Test" });
  await expect(
    repo.update("requests", r.Id, { Title: "x" }, "*"),
  ).rejects.toThrow("ETag");
  f.state.stale = true;
  await expect(
    repo.update("requests", r.Id, { Title: "x" }, '"1"'),
  ).rejects.toThrow("412");
});

test("transport exposes SharePoint write error details without retrying", async () => {
  let calls = 0;
  const client = new SharePointClient(
    async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          error: {
            code: "-2147024784, Microsoft.SharePoint.SPException",
            message: {
              lang: "en-US",
              value: "The attempted operation is prohibited because it exceeds the list view threshold.",
            },
          },
        }),
        {
          status: 507,
          statusText: "Insufficient Storage",
          headers: {
            "Content-Type": "application/json",
            SPRequestGuid: "11111111-2222-3333-4444-555555555555",
          },
        },
      );
    },
    origin,
  );
  await expect(
    client.request("web/lists/getbytitle('Ordering Requests')/items(2)", {
      method: "POST",
    }),
  ).rejects.toThrow(
    /HTTP 507 Insufficient Storage.*Request: POST .*items\(2\).*SharePoint code: -2147024784.*SharePoint message: The attempted operation.*Correlation ID: 11111111-2222-3333-4444-555555555555/,
  );
  expect(calls).toBe(1);
});
test("pagination reads all configuration rows and supports verbose Person arrays", async () => {
  let count = 0;
  const client = new SharePointClient(
    async () =>
      new Response(
        JSON.stringify(
          ++count === 1
            ? {
                d: {
                  results: [{ Id: 1 }],
                  __next: `${SITE_URL}/_api/web/items?$skiptoken=x`,
                },
              }
            : { value: [{ Id: 2 }] },
        ),
        { headers: { "Content-Type": "application/json" } },
      ),
    origin,
  );
  expect(await client.all("web/items")).toEqual([{ Id: 1 }, { Id: 2 }]);
  const f = fixture();
  f.db.engineers[0].EngineersId = { results: [7, 20] };
  expect(
    readRoles(f.db.engineers, f.db.info, f.db.management, f.db.admins)
      .departmentEngineers.Automation,
  ).toEqual([7, 20]);
});
test("mock-only normal workflow, partial shelf and direct handover stamp current actor", async () => {
  const f = fixture(),
    repo = f.repo(true);
  await repo.probe();
  const service = new WorkflowService(repo);
  const id = await service.createRequest({
    department: "Automation",
    items: [{ name: "TEST sensor", quantity: 10, unit: "pcs" }],
  });
  expect(f.db.requests[0].RequesterId).toBe(7);
  expect(f.db.requests[0].RecipientId).toBe(7);
  await service.decide(id, "approve");
  expect(f.db.requests[0].RequestStatus).toBe("To order");
  await service.order(id, {
    supplier: "TEST",
    supplierOrderNo: "TEST-1",
    orderDate: "2026-10-01",
    expectedDate: "2026-10-02",
    quantities: { 1: 10 },
  });
  await service.receive(id, 1, 4, "On shelf", "TEST-A");
  expect(f.db.requests[0].HasOutstandingDelivery).toBe(true);
  await service.pickup(id, 1, 4, 31);
  expect(f.db.requests[0].RequestStatus).toBe("Ordered");
  await service.receive(id, 1, 6, "Direct handover");
  expect(f.db.requests[0].RequestStatus).toBe("Picked up");
  expect(f.db.requests[0].HasOutstandingDelivery).toBe(false);
  expect(f.db.requests[0].HasShelfStock).toBe(false);
  expect(f.db.history.every((r) => r.PerformedById === 7)).toBeTruthy();
  expect(
    f.db.history.find((r) => r.ActionType === "Picked up")?.CollectedById,
  ).toBe(31);
  expect(
    f.db.history.find((r) => r.ActionType === "Direct handover")?.CollectedById,
  ).toBe(7);
  expect(
    f.state.calls.filter(
      (c) => c.method === "POST" && !c.url.includes("contextinfo"),
    ).length,
  ).toBeGreaterThan(0);
});
test("mock-only rejection expiry, corrected history and unmatched parcel operations", async () => {
  const f = fixture(),
    repo = f.repo(true);
  await repo.probe();
  const service = new WorkflowService(repo);
  const id = await service.createRequest({
    department: "Robotics",
    items: [{ name: "TEST part", quantity: 2, unit: "pcs" }],
  });
  await service.decide(id, "reject", "Test reason");
  expect(
    Date.parse(String(f.db.requests[0].RejectedVisibleUntil)) -
      Date.parse(String(f.db.requests[0].RejectedAt)),
  ).toBe(15 * 86400000);
  await service.correct(id, "Requested", "Test correction", true);
  await service.decide(id, "approve");
  await service.order(id, {
    supplier: "TEST",
    supplierOrderNo: "TEST-2",
    orderDate: "2026-10-01",
    expectedDate: "2026-10-02",
    quantities: { 1: 2 },
  });
  const parcel = await service.reportParcel("TEST unknown", "TEST-U");
  await service.matchParcel(parcel, id, 1, 2);
  expect(f.db.parcels[0].ParcelStatus).toBe("Matched");
  expect(f.db.requests[0].RequestStatus).toBe("On shelf");
  await service.pickup(id, 1, 2, 7);
  await service.correct(id, "On shelf", "Test return", true, "TEST-R");
  expect(f.db.lots[0].IsVoid).toBe(true);
  expect(f.db.lots[1].IsVoid).toBe(false);
  expect(
    f.db.history.some(
      (r) => r.ActionType === "Status corrected" && r.BeforeData,
    ),
  ).toBeTruthy();
});

test("User with AllowMultipleValues or SchemaXml Mult passes multi-person validation", async () => {
  for (const metadata of [
    { AllowMultipleValues: true, FieldTypeKind: 20 },
    { AllowMultipleValues: "TRUE", FieldTypeKind: 20 },
    {
      SchemaXml:
        '<Field Type="User" Mult="TRUE" Required="TRUE" UserSelectionMode="PeopleOnly" />',
      FieldTypeKind: 20,
    },
    { SchemaXml: "<Field Type='User' Mult='true' />", FieldTypeKind: 20 },
  ]) {
    const f = fixture();
    f.state.engineersAsUser = true;
    f.state.engineersMetadata = metadata;
    const report = await f.repo().probe();
    expect(report.passed).toBeTruthy();
    expect(f.state.calls.every((c) => c.method === "GET")).toBeTruthy();
    expect(
      f.state.calls.some((c) =>
        c.url.includes("getbyinternalnameortitle('Engineers')"),
      ),
    ).toBeTruthy();
  }
});
test("Person field cardinality rejects actual single selection and conflicting metadata", () => {
  const base = {
    InternalName: "Engineers",
    TypeAsString: "User",
    FieldTypeKind: 20,
  };
  expect(
    fieldTypeError({ ...base, AllowMultipleValues: false }, "UserMulti"),
  ).toContain("found single");
  expect(
    fieldTypeError(
      { ...base, SchemaXml: '<Field Mult="FALSE" />' },
      "UserMulti",
    ),
  ).toContain("found single");
  expect(fieldTypeError(base, "UserMulti")).toContain("found single");
  expect(
    fieldTypeError({ ...base, TypeAsString: "UserMulti" }, "UserMulti"),
  ).toBeUndefined();
  expect(
    fieldTypeError({ ...base, AllowMultipleValues: true }, "User"),
  ).toContain("found multiple");
  expect(
    fieldTypeError(
      {
        ...base,
        AllowMultipleValues: false,
        SchemaXml: '<Field Mult="TRUE" />',
      },
      "UserMulti",
    ),
  ).toContain("conflicting");
  expect(
    fieldTypeError(
      {
        ...base,
        TypeAsString: "Text",
        FieldTypeKind: 2,
        AllowMultipleValues: true,
      },
      "UserMulti",
    ),
  ).toContain("expected a Person field");
});

test("invalid role Person IDs identify the exact list, row, field, display and raw ID", async () => {
  const cases: Array<{
    key: "engineers" | "info" | "management" | "admins";
    field: string;
    idField: string;
    list: string;
  }> = [
    {
      key: "engineers",
      field: "Engineers",
      idField: "EngineersId",
      list: lists.engineers,
    },
    {
      key: "info",
      field: "OrderingUser",
      idField: "OrderingUserId",
      list: lists.info,
    },
    {
      key: "management",
      field: "ManagementUser",
      idField: "ManagementUserId",
      list: lists.management,
    },
    {
      key: "admins",
      field: "AdminUser",
      idField: "AdminUserId",
      list: lists.admins,
    },
  ];
  for (const current of cases) {
    const f = fixture();
    const row = f.db[current.key][0];
    row[current.field] = {
      Title: "Aymane El Imami",
      EMail: "aymane@example.com",
    };
    row[current.idField] = current.key === "engineers" ? [7, null] : null;
    await expect(f.repo().roles()).rejects.toThrow(
      new RegExp(
        `${current.list} row ID ${row.Id}.*invalid Person field ${current.field}.*Aymane El Imami.*${current.idField}.*null`,
      ),
    );
  }
});

test("invalid disabled role row is reported instead of silently ignored", async () => {
  const f = fixture();
  f.db.info.push({
    Id: 99,
    Title: "info",
    OrderingUser: { Title: "Unresolved Person" },
    OrderingUserId: null,
    IsEnabled: false,
  });
  await expect(f.repo().roles()).rejects.toThrow(
    /Ordering Info Users row ID 99.*OrderingUser.*Unresolved Person.*null/,
  );
});
