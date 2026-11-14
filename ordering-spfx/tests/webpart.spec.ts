import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
const root = path.resolve("ordering-spfx");
const require = createRequire(path.join(root, "package.json"));
let transport: any;
let appCode: string;
test.beforeAll(async () => {
  const api = await build({
    entryPoints: [path.join(root, "src/services/readOnly.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    plugins: [
      {
        name: "mock-sp-http",
        setup(b) {
          b.onResolve({ filter: /^@microsoft\/sp-http$/ }, () => ({
            path: "sp-http",
            namespace: "mock",
          }));
          b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
            contents:
              "export const SPHttpClient = { configurations: { v1: {} } };",
          }));
        },
      },
    ],
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", api.outputFiles[0].text)(
    module,
    module.exports,
    require,
  );
  transport = module.exports;
  const app = await build({
    stdin: {
      contents: `import React from 'react';import ReactDOM from 'react-dom';import App from './src/webparts/ordering/components/OrderingApp';window.mountOrdering=(props)=>ReactDOM.render(React.createElement(App,props),document.getElementById('app'));`,
      resolveDir: root,
      loader: "tsx",
    },
    bundle: true,
    format: "iife",
    write: false,
    plugins: [
      {
        name: "mock-styles",
        setup(b) {
          b.onLoad({ filter: /\.scss$/ }, () => ({
            contents: "export default {}",
            loader: "js",
          }));
        },
      },
    ],
  });
  appCode = app.outputFiles[0].text;
});
const site = "https://invitegmbh.sharepoint.com/sites/APLPortalRedesignDEV";
test("WebPartContext identity is used; all writes and wrong-site contexts are blocked", async () => {
  const calls: string[] = [];
  const context = {
    pageContext: {
      web: { absoluteUrl: site },
      user: {
        loginName: "claims|aymane",
        displayName: "Aymane El Imami",
        email: "test@example.com",
      },
    },
    spHttpClient: {
      get: async (url: string) => {
        calls.push(url);
        return new Response(
          JSON.stringify({
            Id: 7,
            LoginName: "claims|aymane",
            Title: "REST name",
            Email: "test@example.com",
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  };
  const repo = transport.createReadOnlyRepository(context);
  expect((await repo.currentUser()).Title).toBe("Aymane El Imami");
  await expect(
    repo.create("requests", { Title: "DO NOT WRITE" }),
  ).rejects.toThrow("Writes disabled");
  for (const method of ["POST", "PATCH", "MERGE", "DELETE", "PUT"])
    await expect(
      repo.client.request("web/currentuser", { method }),
    ).rejects.toThrow("writes are disabled");
  expect(calls).toHaveLength(1);
  expect(() =>
    transport.createReadOnlyRepository({
      ...context,
      pageContext: {
        ...context.pageContext,
        web: { absoluteUrl: "https://other.sharepoint.com/sites/test" },
      },
    }),
  ).toThrow("Other sites");
  context.pageContext.user.loginName = "claims|someone-else";
  await expect(
    transport.createReadOnlyRepository(context).currentUser(),
  ).rejects.toThrow("identity differs");
});

test("controlled SPFx transport adds OData-Version 3.0 to every write", async () => {
  const writes: Array<{ method: string; version: string | null }> = [];
  const context = {
    pageContext: {
      web: { absoluteUrl: site },
      user: { loginName: "claims|aymane", displayName: "Aymane El Imami", email: "test@example.com" },
    },
    spHttpClient: {
      fetch: async (_url: string, _configuration: unknown, options: RequestInit) => {
        const headers = new Headers(options.headers);
        writes.push({ method: String(options.method), version: headers.get("OData-Version") });
        return writes.length === 2
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    },
  };
  const repo = transport.createSharePointRepository(context, true);
  await repo.client.request("contextinfo", { method: "POST" });
  await repo.client.request("web/lists/getbytitle('Ordering Requests')/items", { method: "POST", body: "{}" });
  expect(writes).toEqual([
    { method: "POST", version: "3.0" },
    { method: "POST", version: "3.0" },
  ]);
});

test("live preflight detects an existing parent without items/history and performs no write", async ({ page }) => {
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: appCode });
  await page.evaluate(() => {
    const user = { Id: 7, Title: "Aymane El Imami", LoginName: "claims|aymane", Email: "aymane@example.com" };
    let requestReads = 0;
    const writes: string[] = [];
    const partial = { Id: 1, Title: "Mouse", RequestRef: "INV-000001", Department: "Automation", RequestStatus: "Requested", RequesterId: 7, RecipientId: 7 };
    const repo = {
      probe: async () => ({ passed: true, user, roles: { departmentEngineers: { Automation: [7], Robotics: [7], "Formulation Technology": [7] }, info: [7], management: [7], admins: [7] }, lists: [], errors: [], warnings: [], writesEnabled: true }),
      rows: async (key: string) => {
        if (key === "requests") { requestReads += 1; return requestReads === 1 ? [] : [partial]; }
        return [];
      },
      client: { all: async () => [user] }, assertWritesAllowed: () => undefined,
      currentUser: async () => user,
      create: async (key: string) => { writes.push(key); return { Id: 99, Title: "" }; },
    };
    (window as any).preflightWrites = writes;
    (window as any).mountOrdering({ repository: repo, contextUser: user.Title, newRequestWriteTestEnabled: true });
  });
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page.getByPlaceholder("e.g. Inductive proximity sensor").fill("Should not be created");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByRole("alert")).toContainText("Ordering Requests ID 1");
  await expect(page.getByRole("alert")).toContainText("INV-000001");
  expect(await page.evaluate(() => (window as any).preflightWrites)).toEqual([]);
});
test("read-only ordering screens render, filter and open details without mutation actions", async ({
  page,
}) => {
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: appCode });
  await page.evaluate(() => {
    const requests = [
      {
        Id: 1,
        Title: "Partial sensor order",
        RequestRef: "INV-1",
        Department: "Automation",
        RequestStatus: "On shelf",
        RequesterId: 7,
        RecipientId: 7,
        Supplier: "Test supplier",
        SupplierOrderNo: "PO-1",
      },
      {
        Id: 2,
        Title: "Approved part",
        Department: "Robotics",
        RequestStatus: "To order",
        RequesterId: 7,
        RecipientId: 7,
      },
    ];
    const items = [
      {
        Id: 1,
        Title: "Sensor",
        RequestId: 1,
        RequestedQty: 10,
        OrderedQty: 10,
        ArrivedQty: 4,
        PickedUpQty: 1,
        Unit: "pcs",
      },
    ];
    const user = {
      Id: 7,
      Title: "Aymane El Imami",
      LoginName: "claims|aymane",
      Email: "",
    };
    const repo = {
      probe: async () => ({
        passed: true,
        user,
        roles: {
          departmentEngineers: {
            Automation: [7],
            Robotics: [7],
            "Formulation Technology": [7],
          },
          info: [7],
          management: [7],
          admins: [7],
        },
        lists: [],
        errors: [],
        warnings: [],
        writesEnabled: false,
      }),
      rows: async (k: string) =>
        k === "requests" ? requests : k === "items" ? items : [],
      client: { all: async () => [user] },
    };
    (window as any).mountOrdering({
      repository: repo,
      contextUser: user.Title,
      newRequestWriteTestEnabled: false,
    });
  });
  await expect(
    page.getByRole("heading", { name: "One place. Every order.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Read-only mode", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New request", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Ordered", exact: true })
    .click();
  await expect(page.locator("tbody")).toContainText("Partial sensor order");
  await expect(
    page.getByRole("button", { name: "Placed on shelf", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Open details" }).click();
  await expect(
    page.getByRole("region", { name: "Request details" }),
  ).toContainText("Partial sensor order");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "To order", exact: true })
    .click();
  await expect(page.locator("tbody")).toContainText("Approved part");
  await page.getByLabel("Search", { exact: true }).fill("unmatched");
  await expect(page.getByText(/No requests match/)).toBeVisible();
});

test("membership claims and plain context login identify the same user; other identities stay blocked", async () => {
  const current = {
    Id: 7,
    LoginName: "i:0#.f|membership|aymane@example.com",
    Title: "REST user",
    Email: "shared@example.com",
  };
  const context = {
    pageContext: {
      web: { absoluteUrl: site },
      user: {
        loginName: " Aymane@Example.com ",
        displayName: "Aymane El Imami",
        email: "shared@example.com",
      },
    },
    spHttpClient: {
      get: async () =>
        new Response(JSON.stringify(current), {
          headers: { "Content-Type": "application/json" },
        }),
    },
  };
  expect(
    (await transport.createReadOnlyRepository(context).currentUser()).Id,
  ).toBe(7);
  context.pageContext.user.loginName = "i:0#.f|membership|AYMANE@example.com";
  current.LoginName = "aymane@example.com";
  expect(
    (await transport.createReadOnlyRepository(context).currentUser()).Id,
  ).toBe(7);
  context.pageContext.user.loginName = "someone-else@example.com";
  await expect(
    transport.createReadOnlyRepository(context).currentUser(),
  ).rejects.toThrow("after membership-claim normalization");
  context.pageContext.user.loginName =
    "c:0o.c|another-provider|aymane@example.com";
  await expect(
    transport.createReadOnlyRepository(context).currentUser(),
  ).rejects.toThrow("identity differs");
});

test("controlled mode creates only a Requested parent, item rows and one history row", async ({ page }) => {
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: appCode });
  await page.evaluate(() => {
    const user = { Id: 7, Title: "Aymane El Imami", LoginName: "claims|aymane", Email: "aymane@example.com" };
    const calls: Array<{ kind: string; key?: string; id?: number; fields?: Record<string, unknown> }> = [];
    let nextId = 40;
    const repo = {
      probe: async () => ({ passed: true, user, roles: { departmentEngineers: { Automation: [7], Robotics: [7], "Formulation Technology": [7] }, info: [7], management: [7], admins: [7] }, lists: [], errors: [], warnings: [], writesEnabled: true }),
      rows: async () => [],
      client: { all: async () => [user] },
      assertWritesAllowed: () => undefined,
      currentUser: async () => user,
      create: async (key: string, fields: Record<string, unknown>) => { calls.push({ kind: "create", key, fields }); return { Id: ++nextId, Title: String(fields.Title || "") }; },
      item: async (key: string, id: number) => ({ row: { Id: id, Title: "" }, etag: '"1"' }),
      update: async (key: string, id: number, fields: Record<string, unknown>) => { calls.push({ kind: "update", key, id, fields }); },
    };
    (window as any).writeCalls = calls;
    (window as any).mountOrdering({ repository: repo, contextUser: user.Title, newRequestWriteTestEnabled: true });
  });
  const newRequest = page.getByRole("button", { name: "New request", exact: true });
  await expect(newRequest).toBeEnabled();
  await newRequest.click();
  await page.getByPlaceholder("e.g. Inductive proximity sensor").fill("DEV test sensor");
  await page.getByRole("button", { name: "＋ Add another item" }).click();
  await page.getByPlaceholder("e.g. Inductive proximity sensor").nth(1).fill("DEV test cable");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByRole("status")).toContainText("created in SharePoint");
  const calls = await page.evaluate(() => (window as any).writeCalls);
  expect(calls.filter((x: any) => x.kind === "create" && x.key === "requests")).toHaveLength(1);
  expect(calls.filter((x: any) => x.kind === "create" && x.key === "items")).toHaveLength(2);
  expect(calls.filter((x: any) => x.kind === "create" && x.key === "history")).toHaveLength(1);
  expect(calls.find((x: any) => x.key === "requests").fields).toMatchObject({ RequesterId: 7, RecipientId: 7, RequestStatus: "Requested" });
  expect(calls.some((x: any) => ["lots", "parcels"].includes(x.key))).toBe(false);
});

test("partial create failure reports the confirmed parent ID and stops without retry or delete", async ({ page }) => {
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: appCode });
  await page.evaluate(() => {
    const user = { Id: 7, Title: "Aymane El Imami", LoginName: "claims|aymane", Email: "aymane@example.com" };
    const calls: string[] = [];
    const repo = {
      probe: async () => ({ passed: true, user, roles: { departmentEngineers: { Automation: [7], Robotics: [7], "Formulation Technology": [7] }, info: [7], management: [7], admins: [7] }, lists: [], errors: [], warnings: [], writesEnabled: true }),
      rows: async () => [], client: { all: async () => [user] }, assertWritesAllowed: () => undefined,
      currentUser: async () => user,
      create: async (key: string) => {
        calls.push(`create:${key}`);
        if (key === "requests") return { Id: 81, Title: "Partial test" };
        if (key === "items") throw new Error("simulated item failure");
        return { Id: 99, Title: "" };
      },
      item: async (_key: string, id: number) => ({ row: { Id: id, Title: "" }, etag: '"1"' }),
      update: async () => { calls.push("update:requests"); },
    };
    (window as any).partialCalls = calls;
    (window as any).mountOrdering({ repository: repo, contextUser: user.Title, newRequestWriteTestEnabled: true });
  });
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page.getByPlaceholder("e.g. Inductive proximity sensor").fill("Partial failure test");
  await page.getByRole("button", { name: "Submit request" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Ordering Requests ID 81");
  await expect(alert).toContainText("INV-000081");
  await expect(alert).toContainText("0/1 Ordering Request Items");
  await expect(alert).toContainText("Activity History: not created");
  const calls = await page.evaluate(() => (window as any).partialCalls);
  expect(calls).toEqual(["create:requests", "update:requests", "create:items"]);
});

test("info-only users cannot approve or reject", async ({ page }) => {
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: appCode });
  await page.evaluate(() => {
    const user = { Id: 7, Title: "Info User", LoginName: "claims|info", Email: "info@example.com" };
    const request = { Id: 2, Title: "Approval permission test", RequestRef: "INV-000002", Department: "Automation", RequestStatus: "Requested", RequesterId: 8, RecipientId: 8 };
    const roles = { departmentEngineers: { Automation: [9], Robotics: [9], "Formulation Technology": [9] }, info: [7], management: [], admins: [] };
    const repo = { probe: async () => ({ passed: true, user, roles, lists: [], errors: [], warnings: [], writesEnabled: true }), rows: async (key: string) => key === "requests" ? [request] : key === "items" ? [{ Id: 20, Title: "Part", RequestId: 2, RequestedQty: 1, OrderedQty: null, ArrivedQty: 0, PickedUpQty: 0, Unit: "pcs" }] : [], client: { all: async () => [user] } };
    (window as any).mountOrdering({ repository: repo, contextUser: user.Title, newRequestWriteTestEnabled: true, decisionWriteTestEnabled: true });
  });
  await page.getByRole("button", { name: "Open details ›" }).click();
  await expect(page.getByText(/Only the department engineers/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark as ordered" })).toBeDisabled();
});

test("department engineer approval moves Requested to To order and appends actor history", async ({ page }) => {
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: appCode });
  await page.evaluate(() => {
    const user = { Id: 7, Title: "Automation Engineer", LoginName: "claims|engineer", Email: "engineer@example.com" };
    const request: any = { Id: 2, Title: "Approve me", RequestRef: "INV-000002", Department: "Automation", RequestStatus: "Requested", RequesterId: 8, RecipientId: 8 };
    const history: any[] = [];
    const calls: any[] = [];
    const roles = { departmentEngineers: { Automation: [7], Robotics: [], "Formulation Technology": [] }, info: [], management: [], admins: [] };
    const repo = {
      probe: async () => ({ passed: true, user, roles, lists: [], errors: [], warnings: [], writesEnabled: true }),
      rows: async (key: string) => key === "requests" ? [request] : key === "items" ? [{ Id: 20, Title: "Part", RequestId: 2, RequestedQty: 1, OrderedQty: null, ArrivedQty: 0, PickedUpQty: 0, Unit: "pcs" }] : key === "history" ? history : [],
      client: { all: async () => [user] }, assertWritesAllowed: () => undefined, currentUser: async () => user, roles: async () => roles,
      item: async () => ({ row: { ...request }, etag: '"2"' }),
      update: async (key: string, id: number, fields: any, etag: string) => { calls.push({ kind: "update", key, id, fields, etag }); Object.assign(request, fields); },
      create: async (key: string, fields: any) => { calls.push({ kind: "create", key, fields }); history.push({ Id: 90, Title: fields.Title, ...fields }); return history[0]; },
    };
    (window as any).decisionCalls = calls;
    (window as any).mountOrdering({ repository: repo, contextUser: user.Title, newRequestWriteTestEnabled: true, decisionWriteTestEnabled: true });
  });
  await page.getByRole("button", { name: "Open details ›" }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByPlaceholder("Optional note for activity history").fill("Approved for DEV test");
  await page.getByRole("button", { name: "Approve request", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("approved and moved to To order");
  const calls = await page.evaluate(() => (window as any).decisionCalls);
  expect(calls[0]).toMatchObject({ kind: "update", key: "requests", id: 2, etag: '"2"', fields: { RequestStatus: "To order", ApprovedById: 7 } });
  expect(calls[1]).toMatchObject({ kind: "create", key: "history", fields: { RequestId: 2, ActionType: "Approved", PreviousStatus: "Requested", NewStatus: "To order", PerformedById: 7, ReasonNote: "Approved for DEV test" } });
});

test("management rejection records reason, 15-day visibility and history", async ({ page }) => {
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: appCode });
  await page.evaluate(() => {
    const user = { Id: 7, Title: "Management User", LoginName: "claims|management", Email: "management@example.com" };
    const request: any = { Id: 3, Title: "Reject me", RequestRef: "INV-000003", Department: "Robotics", RequestStatus: "Requested", RequesterId: 8, RecipientId: 8 };
    const history: any[] = [];
    const calls: any[] = [];
    const roles = { departmentEngineers: { Automation: [], Robotics: [9], "Formulation Technology": [] }, info: [], management: [7], admins: [] };
    const repo = {
      probe: async () => ({ passed: true, user, roles, lists: [], errors: [], warnings: [], writesEnabled: true }),
      rows: async (key: string) => key === "requests" ? [request] : key === "items" ? [{ Id: 30, Title: "Part", RequestId: 3, RequestedQty: 1, OrderedQty: null, ArrivedQty: 0, PickedUpQty: 0, Unit: "pcs" }] : key === "history" ? history : [],
      client: { all: async () => [user] }, assertWritesAllowed: () => undefined, currentUser: async () => user, roles: async () => roles,
      item: async () => ({ row: { ...request }, etag: '"4"' }),
      update: async (key: string, id: number, fields: any, etag: string) => { calls.push({ kind: "update", key, id, fields, etag }); Object.assign(request, fields); },
      create: async (key: string, fields: any) => { calls.push({ kind: "create", key, fields }); history.push({ Id: 91, Title: fields.Title, ...fields }); return history[0]; },
    };
    (window as any).rejectCalls = calls;
    (window as any).mountOrdering({ repository: repo, contextUser: user.Title, newRequestWriteTestEnabled: true, decisionWriteTestEnabled: true });
  });
  await page.getByRole("button", { name: "Open details ›" }).click();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page.getByPlaceholder("Explain why this request is rejected").fill("Not required for this setup");
  await page.getByRole("button", { name: "Reject request", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("was rejected");
  const calls = await page.evaluate(() => (window as any).rejectCalls);
  expect(calls[0]).toMatchObject({ kind: "update", key: "requests", id: 3, fields: { RequestStatus: "Rejected", RejectedById: 7, RejectionReason: "Not required for this setup" } });
  expect(Date.parse(calls[0].fields.RejectedVisibleUntil) - Date.parse(calls[0].fields.RejectedAt)).toBe(15 * 86400000);
  expect(calls[1]).toMatchObject({ kind: "create", key: "history", fields: { RequestId: 3, ActionType: "Rejected", PreviousStatus: "Requested", NewStatus: "Rejected", PerformedById: 7, ReasonNote: "Not required for this setup" } });
});

test("decision history failure reports the updated parent without retry or rollback", async ({ page }) => {
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: appCode });
  await page.evaluate(() => {
    const user = { Id: 7, Title: "Admin User", LoginName: "claims|admin", Email: "admin@example.com" };
    const request: any = { Id: 4, Title: "Partial decision", RequestRef: "INV-000004", Department: "Automation", RequestStatus: "Requested", RequesterId: 8, RecipientId: 8 };
    const calls: string[] = [];
    const roles = { departmentEngineers: { Automation: [], Robotics: [], "Formulation Technology": [] }, info: [], management: [], admins: [7] };
    const repo = {
      probe: async () => ({ passed: true, user, roles, lists: [], errors: [], warnings: [], writesEnabled: true }),
      rows: async (key: string) => key === "requests" ? [request] : key === "items" ? [{ Id: 40, Title: "Part", RequestId: 4, RequestedQty: 1, OrderedQty: null, ArrivedQty: 0, PickedUpQty: 0, Unit: "pcs" }] : [],
      client: { all: async () => [user] }, assertWritesAllowed: () => undefined, currentUser: async () => user, roles: async () => roles,
      item: async () => ({ row: { ...request }, etag: '"5"' }),
      update: async (_key: string, _id: number, fields: any) => { calls.push("update:requests"); Object.assign(request, fields); },
      create: async () => { calls.push("create:history"); throw new Error("simulated history failure"); },
    };
    (window as any).partialDecisionCalls = calls;
    (window as any).mountOrdering({ repository: repo, contextUser: user.Title, newRequestWriteTestEnabled: true, decisionWriteTestEnabled: true });
  });
  await page.getByRole("button", { name: "Open details ›" }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Approve request", exact: true }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("was updated to To order");
  await expect(alert).toContainText("Activity History entry was not confirmed");
  await expect(alert).toContainText("No automatic retry, rollback, or deletion");
  expect(await page.evaluate(() => (window as any).partialDecisionCalls)).toEqual(["update:requests", "create:history"]);
});
