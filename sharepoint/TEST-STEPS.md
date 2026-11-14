# SharePoint DEV connection test — read-only first

Target: https://invitegmbh.sharepoint.com/sites/APLPortalRedesignDEV

## Current state

- All integration files are separate under `sharepoint/`. The existing Vite sources, entry point, scripts, local storage and sample-user switcher are unchanged.
- The adapter reads all nine lists, resolves the authenticated site user and reads all four role lists. It checks internal names/types, choice values and lookup targets against the agreed schema.
- Only `EngineersId` from the multi-person **Engineers** field grants engineering permissions. Legacy **Engineer/EngineerId** is not used. Duplicate info labels are fine: membership is keyed by enabled Person IDs, not Title or display name.
- Aymane El Imami is not hard-coded. If the signed-in SharePoint user ID belongs to all enabled role lists, the diagnostic will show the combined memberships.
- Writes are disabled by default. The read-only snippet has an additional transport guard that rejects every non-GET request. It never calls contextinfo, seeds samples, creates items, sends email, changes schemas or deletes anything.
- An unsigned-in GET from the development environment reached the current-user endpoint and returned **403**. This is **not a successful live test** and does not tell us whether your signed-in account has the correct access. Local mock tests are not evidence of tenant access.

## 1. Build locally

From the existing project folder:

```powershell
node sharepoint/build.mjs
```

This type-checks the separate adapter and creates:

- `sharepoint/dist/read-only-test.js` — self-contained read-only browser diagnostic.
- `sharepoint/dist/sharepoint-services.js` — separate repository/workflow library for later integration; not used by the diagnostic UI.

It uses the dependencies already installed with the prototype. No installation, upload, SharePoint connection or deployment occurs during build. The existing app remains available through `npm run dev` and is built separately with `npm run build`.

## 2. Run the read-only test in your authenticated SharePoint tab

The localhost Vite app does not inherit the SharePoint tab's authentication context. Do not copy cookies, access tokens or passwords into the project. Run this reviewed, local diagnostic in the actual target-site tab instead. Microsoft describes authenticated SharePoint API access in [SPFx](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/connect-to-sharepoint); the later SPFx host will provide that context directly.

1. Open the DEV site above in Edge or Chrome and sign in normally as the account configured in the lists. Stay on a page **inside APLPortalRedesignDEV**, not the Microsoft login screen or another site.
2. Open `sharepoint/dist/read-only-test.js` locally and review it. It is generated from `sharepoint/src/diagnostic.ts` and the read-only repository checks. It sends requests only to this DEV site's REST API; no external script loader or credential capture is used.
3. Press **F12** in the SharePoint tab. Open **Sources → Snippets** (use the Sources overflow menu if Snippets is hidden), then **New snippet**. Name it `invite-read-only-test`.
4. Copy the entire contents of `sharepoint/dist/read-only-test.js` into that snippet. Save it, then run it using **Ctrl+Enter** while focused in the snippet editor. If company policy disables developer tools/snippets, stop and ask the site/development administrator to run it in an approved SharePoint/SPFx development context; do not disable browser security protections.
5. A temporary **INVITE — SharePoint read-only test** panel appears. It changes only the browser page's local DOM, not the saved SharePoint page. Wait for PASS or FAIL.
6. Use **Copy test summary**. The summary includes your display name/site user ID, list check results and your role flags, not request contents, credentials or tokens. Review it before sharing it here.
7. Close the panel or reload the page to remove it. No SharePoint cleanup is needed.

You do not need to install an extension, deploy a web part, register an Entra app or change tenant settings for this diagnostic. Never paste an unreviewed third-party console script; use only the locally generated file described above.

## 3. Expected successful result

The top line must say **PASS — current user, list reads, schema and roles verified.** All nine lists must show PASS:

1. Ordering Department Engineers
2. Ordering Info Users
3. Ordering Management Users
4. Ordering Admin Users
5. Ordering Requests
6. Ordering Request Items
7. Ordering Delivery Lots
8. Ordering Activity History
9. Ordering Unidentified Parcels

Below that, verify:

- The signed-in name is your expected account, e.g. **Aymane El Imami**.
- Engineer includes the departments where that same identity appears in **Engineers**.
- Info ordering, Management and Admin each show **true** if that identity is in an enabled row of each respective configuration list.
- It still says **Writes remain DISABLED**.

Empty request/item/lot/history/parcel lists are a successful read. The probe requests at most one item ID from each business list; it does not enumerate business records. Role configurations are fully paged because a role may appear on later pages.

If only Aymane is currently configured in each department, a note about one engineer instead of two is expected and does not fail the test. Missing/duplicate department rows, an empty Engineers field, wrong column types or incomplete enabled-role fields fail the role check. The three exact department labels are Automation, Robotics and Formulation Technology.

With one person in every role, this test proves the combined positive access path. Before rollout, use separate real test identities to verify employee-only, info-only, engineer-only and management-only restrictions; one all-role account cannot prove those negative cases.

## 4. If a check fails

| Result | Meaning / next check |
| --- | --- |
| Must run in signed-in DEV tab | The snippet ran on localhost, a login page, or another site. Use the actual DEV site page. |
| 401 / 403 | Sign-in or actual list read permission is missing. Configuration membership alone does not grant SharePoint access. |
| Non-JSON page / redirect failure | SharePoint returned login/HTML instead of REST JSON; re-open the site and sign in normally. |
| 404 | Check the exact list title and internal column names. |
| Missing internal column | A display label may match while its internal name differs. Report the actual internal name before changing any column or code. No automatic rename/create is performed. |
| Engineers expected multiple Person selection | Confirm the new Engineers column is Person, multiple selections allowed. The diagnostic accepts either `UserMulti` or `User` with `AllowMultipleValues = true` / `SchemaXml Mult="TRUE"`. Do not modify the legacy Engineer column to bypass the check. |
| REST identity differs from WebPartContext | Reload the Workbench first. The comparison already normalizes SharePoint's standard membership-claim prefix and case. If the displayed Context and REST login values still identify different accounts, close other Microsoft 365 tabs or sign out/in with the intended account, then reopen the Workbench. Do not proceed based only on a matching display name. |
| Lookup target mismatch | The named lookup points at a different list. Confirm its source list in List settings. |
| Choices missing | Compare the listed values with the agreed schema. The probe reports the missing values; it does not add them. |
| Role false | Check the Person selection resolves to the signed-in site user and IsEnabled is Yes. A matching label/name is not enough. |
| Invalid Person field | The message identifies the role list, row ID/title, field, displayed Person value and raw lookup/person ID. Correct that specific list row manually, then refresh. Multiple invalid rows are reported together. |

Do not create request/order records to work around a failed read test. Send the summary so we can map actual schema differences first.

## 5. What is prepared for the next step

`SharePointRepository` supplies paged reads, current-user resolution, role reads, schema probing, item reads with ETags, and gated item creation/update. No delete, list provisioning, permission manipulation or migration of fictional data is included.

`WorkflowService` prepares current-user-stamped request creation, decisions, requester reply, ordering, shelf receipt, direct handover, partial quantities, pickup, parcel reporting/matching, audited status correction and admin configuration writes. Individual real actors are written as SharePoint Person IDs, while recipient/collector IDs remain distinct.

The writer requires both an explicit developer-created test-write session and a successful probe in that same repository instance. Merely running the read-only snippet cannot unlock it. We have not created that session on your tenant. A new failed probe removes readiness. No localStorage feature flag or query-string switch turns on writes.

The current-user identity is fetched again at action time, as are role memberships. The local sample names and prototype info alias do not participate. Form digests protect cookie-authenticated writes; concrete ETags reject stale item updates. See Microsoft's [REST operations](https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins/complete-basic-operations-using-sharepoint-rest-endpoints) and [list-item ETags](https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins/working-with-lists-and-list-items-with-rest).

**Boundary for this stage:** the original screens still use the local repository. They are deliberately not connected to SharePoint yet. The separate async service preserves the workflow concepts but is not a drop-in replacement for the synchronous local store. After the authenticated read test succeeds, the next integration step is an isolated SharePoint-hosted screen entry point, with async loading/error handling and real identity; the existing local version can remain alongside it. Requester item edits and the complete view/retention mapping must be wired there rather than changing the local prototype now.

**Before live write testing:** this browser test adapter relies on the signed-in user's actual SharePoint permissions. Its role checks are not a production security boundary; broad list Edit access could bypass them. A trusted server-side action route must enforce the same rules before rollout. Multi-list operations are sequential, not atomic: a failure stops the writer instance and reports an operation ID, but earlier writes may remain. Do not blindly retry or delete those rows. Production needs server-side concurrency, idempotency/reconciliation and authoritative timestamps. Client action times are provisional in this test adapter; built-in Created/Modified retain SharePoint timestamps. No claim of production-ready transaction security is made by a passing read-only test.

## 6. Local verification commands

```powershell
node sharepoint/build.mjs
node node_modules/@playwright/test/cli.js test --config sharepoint/playwright.config.ts
npm run build
```

Adapter tests use a fake HTTP transport only. They cover read-only GET behavior, all nine schemas, real-ID role resolution, ignoring Engineer, enabled flags, missing schemas/lists, localhost and external URL blocking, pagination, login failures, ETag conflicts, actor stamping, partial receipts, direct handover, rejection expiry, corrections and parcel matching. They never contact SharePoint. The last command verifies the preserved Vite build.
