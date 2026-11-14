# INVITE Ordering — SPFx DEV test

SPFx 1.23.2 / React 17 web part for the DEV site. It uses the approved ordering workspace design and reads the nine existing SharePoint lists. The original Vite prototype remains separate and unchanged.

## Start the Workbench test

From this folder:

```powershell
npm start
```

To start without opening a browser:

```powershell
npm start -- --nobrowser
```

Then open:

[Ordering DEV SharePoint Workbench](https://invitegmbh.sharepoint.com/sites/APLPortalRedesignDEV/_layouts/15/workbench.aspx?debug=true&noredir=true&debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js)

Add **INVITE Ordering — DEV test** to the Workbench. Keep the terminal running. No App Catalog deployment is needed.

## Controlled write gate

`OrderingWebPart.enableNewRequestWriteTest` and `OrderingWebPart.enableDecisionWriteTest` are private compile-time switches, currently explicitly set to `true` for this requested DEV test. There is no URL, property-pane or browser-storage switch. Set them to `false` after testing.

The repository constructor still defaults to writes disabled. The UI imports only the narrow `NewRequestService` and `DecisionService`. Request changes, ordering, receiving, direct handover, pickup and status correction remain disabled.

Every SPFx write request, including the form-digest request, list creates and the reference update, carries `OData-Version: 3.0`. Read requests retain the existing SharePoint-compatible header behavior.

A successful submission creates or changes only:

1. One new row in **Ordering Requests**, with Requester from SharePoint current user, Recipient defaulting to that user, and RequestStatus `Requested`. The same row is updated once to add its `INV-000000` reference.
2. One new row in **Ordering Request Items** for every item entered in the form.
3. One new row in **Ordering Activity History**, with ActionType/NewStatus `Requested` and PerformedBy set to the SharePoint current user.

It creates no delivery lots, unidentified parcels, approvals, orders, receipts or pickups. SharePoint REST cannot make these multi-list writes atomic. If any step fails after the parent exists, the error shows the **Ordering Requests ID**, expected `INV-000000` reference, number of item rows completed, and whether history was created. The service stops further submissions in that browser session; it does not retry or delete anything automatically. Inspect **Ordering Requests**, **Ordering Request Items**, and **Ordering Activity History** before refreshing and retrying.

An approval updates one **Ordering Requests** row from `Requested` to `To order`, writes ApprovedBy/ApprovedAt, and creates one **Ordering Activity History** row. A rejection updates one request to `Rejected`, writes the actor, timestamp, required reason and 15-day visibility date, then creates one history row. Live user, role configuration, request status and concrete ETag are checked immediately before either action. Info membership alone grants no decision permission. If the parent update succeeds but history fails, the error names the request and resulting status; nothing is retried, rolled back or deleted automatically.

## What to test

1. Confirm the banner says **Controlled DEV writes: New request + Approve/Reject**.
2. Expand **Connection checks** and confirm PASS, the correct current user, 9/9 lists, and write scope **New request + Approve/Reject**.
3. Open all sidebar pages and test department, search and status filters. Existing SharePoint records should appear; fictional Vite records must not.
4. As the assigned department engineer, management user or admin, open a Requested record and confirm Approve/Reject are available. An info-only user must not get these actions. Ordering and all delivery buttons remain disabled.
5. Select **New request**. Check the default requester/recipient, all three departments, optional needed date and product link, multiple item lines, and the “Ordering for someone else” person selector.
6. Submit one clearly named DEV test request once. Confirm the success message and new Requested record.
7. Inspect **Ordering Requests**, **Ordering Request Items**, and **Ordering Activity History** directly in SharePoint using the record details above. Confirm no rows appeared in the other lists.
8. Approve one DEV Requested record. Confirm its request row becomes `To order` and exactly one Approved history row appears.
9. Create another clearly named DEV request and reject it with a reason. Confirm its request row becomes `Rejected`, the 15-day fields are populated, and exactly one Rejected history row appears.

## Build and verification

```powershell
# Inside ordering-spfx
npm run build

# From the parent ordering project
npx playwright test -c ordering-spfx/tests/playwright.config.ts

# Prepared adapter regression tests
npx playwright test -c sharepoint/playwright.config.ts
```

The browser tests cover the read-only gate, identity matching, approved workspace navigation, disabled workflow actions, and the exact parent/items/history write scope. Tenant permissions and actual SharePoint writes must still be checked in the authenticated Workbench.

This remains DEV-only. Nothing is packaged, deployed, or connected to production.
