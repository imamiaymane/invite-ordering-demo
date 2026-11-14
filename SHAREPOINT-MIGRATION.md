# SharePoint ordering app: proposed schema and manual setup

Updated for the expanded role model. The initial lists have been created manually by the user; this document does not verify or modify that site. The local prototype permission model is updated. No SharePoint connection, flow or deployment has been made. See SHAREPOINT-ROLE-UPDATE.md for safe changes to existing lists.

This is a proposed storage design for the approved app. It preserves the simple user workflow:

**Requested → To order → Ordered → On shelf → Picked up**

Rejected is a separate end status, visible for 15 days after rejection. The existing Changes requested / requester reply exception is also retained.

## 1. Lists and relationships

| List | One row represents | Purpose |
| --- | --- | --- |
| Ordering Requests | A request and its one supplier order | Department, requester, decision, supplier details and overall status |
| Ordering Department Engineers | One department | Two current assigned engineers |
| Ordering Info Users | One enabled ordering identity | Who can order under the shared info responsibility, across all departments |
| Ordering Management Users | One management identity | Decisions, ordering and corrections across departments |
| Ordering Admin Users | One admin identity | All workflow and configuration access |
| Ordering Activity History | One event, or one allocation of a quantity event | Who did what and when, reasons, quantities and correction evidence |
| Ordering Unidentified Parcels — optional | One unmatched parcel | Arrival, shelf and later matching |
| Ordering Request Items — supporting list | One item line within a request | Requested/ordered/arrived/picked quantities, unit and product link |
| Ordering Delivery Lots — supporting list | One received portion of an item | Separate arrivals, shelf locations and remaining stock |

The last two lists are recommended because the existing prototype already supports multiple item lines, partial arrivals and multiple shelf locations. They are storage lists, not new app screens. Storing all of this as one text/JSON field would make filtering and updating stock harder. One request still has one approval and one supplier order; supplier splitting is outside the current scope.

Relationships: Request → many Ordering Request Items → many Ordering Delivery Lots. History links to the request and, when relevant, the item and lot. An unidentified parcel can later link to one request item and its resulting delivery lot, matching the prototype.

## 2. Column conventions

- **Required** means SharePoint's column setting. Fields needed only at a particular workflow step remain **No** in the list schema; the future action handler must require them at that step.
- Text = Single line of text. Notes = Multiple lines of text, **plain text**, append changes disabled. Choice = single selection, no fill-in values. Person = Person or Group, **People only**, single selection except Engineers, which allows multiple selections.
- Date = Date and Time column configured as **Date only**. Timestamp = Date and Time column configured to include time. Capture action timestamps on the trusted server; compare retention using UTC instants and display in the site's local timezone.
- Quantity Number columns: allow decimals (Automatic), minimum 0; future action validation allows up to six decimal places, matching the prototype. Requested and ordered quantities must be strictly positive when supplied. Do not use a list-wide integer-only setting: quantities can be lengths or weights.
- Names below are the exact proposed internal names. Create custom columns using these names first, then rename their display labels. Internal names remain fixed after creation. See [Microsoft naming guidance](https://learn.microsoft.com/en-us/microsoft-365/community/sharepoint-naming-guidelines).
- Reuse the built-in **Title** column wherever shown; rename its display label without creating another Title column. Other built-in fields below are automatically present. Microsoft documents the available [column types and settings](https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/list-and-library-column-types-and-options).
- Examples are fictional. Person columns need actual tenant identities when you configure the real lists; do not create accounts for the fictional names.

### Built-in columns on every list — do not create these again

| Display name | Internal name | Type | Required | Example | Notes |
| --- | --- | --- | --- | --- | --- |
| ID | ID | Counter, system | Yes, automatic | 42 | Stable list item ID; lookup relationships use this ID |
| Created | Created | Timestamp, system | Yes, automatic | 2026-09-29 09:00 UTC | When SharePoint created the row |
| Created By | Author | Person, system | Yes, automatic | Alex Morgan | Writer identity; may be the service identity for backend writes |
| Modified | Modified | Timestamp, system | Yes, automatic | 2026-09-29 10:00 UTC | Last row update, not necessarily a workflow event |
| Modified By | Editor | Person, system | Yes, automatic | Nora Beck | Last writer; not a replacement for the event actor |

## 3. Ordering Requests

One row per request/order. Item names and quantities live in Ordering Request Items; Title is a readable summary, normally the first item name.

| Display name | Internal name | Type | Required | Example | Notes |
| --- | --- | --- | --- | --- | --- |
| Request title | Title | Text | Yes | Inductive proximity sensors | Summary; app maintains it from the item lines |
| Request reference | RequestRef | Text | No | INV-000042 | App generates after ID is assigned; unique, indexed; never a supplier number |
| Department | Department | Choice | Yes | Automation | Automation; Robotics; Formulation Technology |
| Requester | Requester | Person | Yes | Alex Morgan | Set from authenticated user, not an editable submitter name |
| Recipient | Recipient | Person | Yes | Alex Morgan | Defaults to requester; change only for ordering for someone else |
| Needed date | NeededDate | Date | No | 2026-10-15 | Requester's optional target date |
| Status | RequestStatus | Choice | Yes | To order | Requested; To order; Ordered; On shelf; Picked up; Rejected; Changes requested. Default Requested |
| Approved by | ApprovedBy | Person | No | Nora Beck | Required on approval; preserves actual approving identity if configuration changes |
| Approved at | ApprovedAt | Timestamp | No | 2026-09-29 10:00 UTC | Approval action time |
| Rejected by | RejectedBy | Person | No | Nora Beck | Required on rejection |
| Rejected at | RejectedAt | Timestamp | No | 2026-09-29 10:00 UTC | Required on rejection; retention starts here |
| Rejection reason | RejectionReason | Notes | No | Already available in stock | Mandatory for the Reject action |
| Rejected visible until | RejectedVisibleUntil | Timestamp | No | 2026-10-14 10:00 UTC | Action handler writes RejectedAt + 15 days; not a calculated TODAY column |
| Changes requested note | ChangeRequestNote | Notes | No | Please confirm the connector size | Used only for the existing engineer/reply exception; replies also go in history |
| Supplier | Supplier | Text | No | Fictional Sensor Supply | Required when marking Ordered |
| Supplier order number | SupplierOrderNo | Text | No | DEMO-PO-2401 | Required when marking Ordered; not unique globally |
| Order date | OrderDate | Date | No | 2026-09-29 | Business date of supplier order; required when ordering |
| Ordered by | OrderedBy | Person | No | Actual signed-in ordering user | Required when ordering; not the text label info |
| Ordered at | OrderedAt | Timestamp | No | 2026-09-29 11:02 UTC | When ordering was recorded |
| Expected delivery date | ExpectedDate | Date | No | 2026-10-05 | Required on ordering, as in the approved prototype |
| Order comment | OrderComment | Notes | No | Supplier pack contains 10 | Optional ordering note |
| Has outstanding delivery | HasOutstandingDelivery | Yes/No | Yes | Yes | Default No. App-maintained: at least one placed item has ordered > arrived |
| Has shelf stock | HasShelfStock | Yes/No | Yes | Yes | Default No. App-maintained from non-void delivery lots |
| Fully picked up at | FullyPickedUpAt | Timestamp | No | 2026-10-06 14:05 UTC | Set only when all ordered quantities have been collected; collection history is still per event |

No Purpose or Project / cost centre columns. No separate editable engineer/order-person field on requests: permission checks use current configuration. Historical approval/order people are retained in their Person fields and history.

## 4. Ordering Department Engineers

Exactly three rows, one per department. Either engineer can act independently; there is no two-person approval quorum.

| Display name | Internal name | Type | Required | Example | Notes |
| --- | --- | --- | --- | --- | --- |
| Department | Title | Text | Yes | Automation | Unique; exact three agreed names |
| Engineers | Engineers | Person, multiple selections | Yes | Nora Beck; Felix Braun | People only; two people per department now. Do not enforce unique values on this multi-person column |

Both engineers can approve, reject, request changes, correct and order for their department. Use the new Engineers column; retire legacy Engineer only after checking data and dependencies. The lookup key remains Title and the existing department rows remain intact.

## 5. Ordering identity configuration

### Ordering Info Users

One row per real ordering person; two rows initially, more allowed later. The UI responsibility remains **info**. No ordering team screen is needed.

| Display name | Internal name | Type | Required | Example | Notes |
| --- | --- | --- | --- | --- | --- |
| Ordering label | Title | Text | Yes | info | Cosmetic label; not unique |
| Ordering user | OrderingUser | Person, single | Yes | Actual ordering employee | People only; unique person per row |
| Enabled | IsEnabled | Yes/No | Yes | Yes | Default Yes; disabled rows grant no role |
| Contact email | ContactEmail | Text | No | info@invite-research.com | Shared mailbox address; not an authorization key |

The prototype info persona remains a local testing convenience, not a third production membership row. Actual users sign in individually; audit fields record the actual person. A shared mailbox address does not identify the human actor; see [Microsoft shared mailbox guidance](https://learn.microsoft.com/en-us/microsoft-365/lighthouse/m365-lighthouse-block-signin-shared-mailboxes?view=o365-worldwide).

### Ordering Management Users

| Display name | Internal name | Type | Required | Example | Notes |
| --- | --- | --- | --- | --- | --- |
| Label | Title | Text | Yes | Management | Default Management |
| Management user | ManagementUser | Person, single | Yes | Actual management member | People only; unique; three rows initially |
| Enabled | IsEnabled | Yes/No | Yes | Yes | Default Yes |

Management can approve, reject, request changes, correct and order across departments. It does not grant configuration editing.

### Ordering Admin Users

| Display name | Internal name | Type | Required | Example | Notes |
| --- | --- | --- | --- | --- | --- |
| Label | Title | Text | Yes | Admin | Default Admin |
| Admin user | AdminUser | Person, single | Yes | Aymane, resolved tenant identity | People only; unique; one row initially |
| Enabled | IsEnabled | Yes/No | Yes | Yes | Default Yes; preserve a verified active administrator |

Admin can use every workflow action across all records and administer configuration. A site owner must grant the corresponding real SharePoint access separately: adding an Admin Users row does not grant SharePoint Full Control. Normal stage/quantity checks still apply; use controlled corrections rather than invalid transitions. Prototype configuration remains in src/departmentRoles.ts, without a new configuration screen.

### Future ordering email recipients

Send to the union of **info@invite-research.com** and the resolved emails of every enabled Ordering Info Users.OrderingUser. Deduplicate addresses case-insensitively. Handle missing email values explicitly; do not derive permissions from ContactEmail. No emails or Power Automate flows are created now.

## 6. Ordering Request Items — supporting list

| Display name | Internal name | Type | Required | Example | Notes |
| --- | --- | --- | --- | --- | --- |
| Item name | Title | Text | Yes | Inductive proximity sensor | Searchable item title |
| Request | Request | Lookup → Ordering Requests: RequestRef | Yes | INV-000042 | Single lookup; stores parent ID |
| Requested quantity | RequestedQty | Number | Yes | 10 | Must be > 0; retain separately from the actual order |
| Unit | Unit | Text | Yes | pcs | Simple units such as pcs, m, L, kg; preserve prototype flexibility |
| Product link | ProductLink | Hyperlink | No | https://example.com/sensor | Optional product page |
| Ordered quantity | OrderedQty | Number | No | 10 | Blank before ordering; > 0 for every ordered line |
| Arrived quantity | ArrivedQty | Number | Yes | 6 | Default 0; app-maintained from non-void lots, including direct handovers |
| Picked-up quantity | PickedUpQty | Number | Yes | 4 | Default 0; app-maintained from non-void lots |

Remaining delivery = OrderedQty − ArrivedQty; shelf stock = ArrivedQty − PickedUpQty. These can be derived without more columns. Never sum different units to decide completion; check each line individually.

## 7. Ordering Delivery Lots — supporting list

Each partial receipt makes its own lot. A direct handover makes a lot whose arrived and picked quantities are equal, with no shelf location.

| Display name | Internal name | Type | Required | Example | Notes |
| --- | --- | --- | --- | --- | --- |
| Delivery reference | Title | Text | Yes | DEL-000087 | App-assigned readable label |
| Request item | RequestItem | Lookup → Ordering Request Items: Title | Yes | Inductive proximity sensor | Use lookup ID, not title text, to identify the line |
| Arrived quantity | ArrivedQty | Number | Yes | 6 | Must be > 0; cannot exceed remaining ordered quantity |
| Picked-up quantity | PickedUpQty | Number | Yes | 4 | Default 0; cannot exceed lot arrival quantity |
| Arrival method | ArrivalMethod | Choice | Yes | On shelf | On shelf; Direct handover |
| Shelf location | ShelfLocation | Text | No | A-03 | Required for On shelf; blank for direct handover |
| Arrived by | ArrivedBy | Person | Yes | Maya Chen | Employee recording the arrival |
| Arrived at | ArrivedAt | Timestamp | Yes | 2026-10-05 09:12 UTC | Arrival time; preserve original parcel arrival if matching an unidentified parcel |
| Is void | IsVoid | Yes/No | Yes | No | Default No. Corrections void superseded lots rather than deleting evidence |

History records each pickup, its collector and time. A pickup spanning two lots produces two quantity history entries with the same OperationId; the app groups them into one action. This supports oldest-stock-first collection without a separate pickup list.

## 8. Ordering Activity History

Treat as append-only for normal users. Version history is useful but is not a replacement for this business timeline. Corrections add new events and preserve previous evidence.

| Display name | Internal name | Type | Required | Example | Notes |
| --- | --- | --- | --- | --- | --- |
| Summary | Title | Text | Yes | Placed 6 pcs on shelf A-03 | Short readable description |
| Event key | EventKey | Text | Yes | 4d62…:receipt:87 | Unique indexed key; future handler uses it to prevent duplicate retry events |
| Operation ID | OperationId | Text | Yes | 4d62… | GUID per user action; shared by its related event entries |
| Request | Request | Lookup → Ordering Requests: RequestRef | No | INV-000042 | Required for request actions; absent for unmatched parcel reports |
| Request item | RequestItem | Lookup → Ordering Request Items: Title | No | Inductive proximity sensor | Required for quantity events |
| Delivery lot | DeliveryLot | Lookup → Ordering Delivery Lots: Title | No | DEL-000087 | Required for receipt/pickup quantities |
| Parcel | Parcel | Lookup → Ordering Unidentified Parcels: Title | No | Unknown box, label AB123 | Add only if optional parcels list exists |
| Action | ActionType | Choice | Yes | Placed on shelf | Values listed below |
| Previous status | PreviousStatus | Choice | No | Ordered | Same status choices as requests; blank on creation |
| New status | NewStatus | Choice | No | On shelf | Same choices; may equal previous status on partial receipts |
| Performed by | PerformedBy | Person | Yes | Maya Chen | Actual authenticated initiating user; determined by server |
| Performed at | PerformedAt | Timestamp | Yes | 2026-10-05 09:12 UTC | Event timestamp from trusted handler |
| Quantity | Quantity | Number | No | 6 | Positive moved quantity for receipts/pickups, not cumulative total |
| Unit | Unit | Text | No | pcs | Unit snapshot for quantity events |
| Shelf location | ShelfLocation | Text | No | A-03 | Historical location snapshot |
| Collected by | CollectedBy | Person | No | Alex Morgan | Required for pickup/direct handover; different from employee recording it |
| Reason or note | ReasonNote | Notes | No | Entered arrival against wrong order | Required for rejection, requesting changes, replies and corrections as applicable |
| Previous values | BeforeData | Notes | No | JSON snapshot of previous status, items and lots | Correction evidence, generated by handler; not editable JSON in the app |
| New values | AfterData | Notes | No | JSON snapshot after correction | Correction result, with referenced IDs and relevant quantities |

Action choices: Requested; Approved; Rejected; Changes requested; Requester replied; Ordered; Placed on shelf; Direct handover; Picked up; Status corrected; Parcel reported; Parcel matched.

Partial delivery is a quantity on Placed on shelf or Direct handover, not a new lifecycle status. A direct handover event records both arrival and collection together, including CollectedBy. Audit entries retain every important field change, including ordering metadata and correction reason. Previous values must include replaced receipt/collection references so corrected events can be excluded from current pickup views without deleting them.

For a correction that resets receipts: mark the previous lots IsVoid = Yes, clear/recompute current quantities, append a correction event, and create replacement lots only when needed. A picked-up view excludes void lots while history continues to show the old events. No cascade deletion of history.

## 9. Ordering Unidentified Parcels — optional

| Display name | Internal name | Type | Required | Example | Notes |
| --- | --- | --- | --- | --- | --- |
| Parcel description | Title | Text | Yes | Small box, label AB123 | What is visible on the parcel |
| Sender | Sender | Text | No | Fictional Lab Supplies | Known sender, if any |
| Shelf location | ShelfLocation | Text | Yes | U-01 | Where the unknown parcel was put |
| Arrived by | ArrivedBy | Person | Yes | Maya Chen | Automatically identified employee |
| Arrived at | ArrivedAt | Timestamp | Yes | 2026-10-05 09:00 UTC | Original arrival timestamp |
| Status | ParcelStatus | Choice | Yes | Unidentified | Unidentified; Matched. Default Unidentified |
| Matched request item | MatchedRequestItem | Lookup → Ordering Request Items: Title | No | Inductive proximity sensor | Required when matched |
| Matched delivery lot | MatchedDeliveryLot | Lookup → Ordering Delivery Lots: Title | No | DEL-000087 | Receipt created during matching |
| Matched by | MatchedBy | Person | No | Alex Morgan | Person performing matching |
| Matched at | MatchedAt | Timestamp | No | 2026-10-05 10:00 UTC | Matching time, separate from original arrival |

Matching validates the remaining order quantity, creates a lot with the original arrival person/time/location, and records the matching actor/time in history. A parcel is matched once; retries must not receive it twice.

## 10. Person fields and actual access rules

Use Person fields for Requester, Recipient, Engineers (multi-person), OrderingUser, ManagementUser, AdminUser, ApprovedBy, RejectedBy, OrderedBy, ArrivedBy, MatchedBy, PerformedBy and CollectedBy, plus built-in Author/Editor. Use stable resolved identities for authorization, not display-name comparisons or text email equality.

The future application must set Requester and action actors from the authenticated session. Recipient and CollectedBy are user-selected people where needed. The signed-in employee recording a pickup and the person collecting it may differ. If a backend/service writes the row, Author/Editor can name that service; PerformedBy still records the authenticated employee who initiated the action. Never trust a client-supplied actor field.

| Action | Who can initiate it | Required current state |
| --- | --- | --- |
| View | All INVITE employees | Any record; active-view retention is filtering, not security |
| Create request | All INVITE employees | New request |
| Approve / reject / request changes | Either department engineer, enabled management user or enabled admin | Requested |
| Mark ordered | Enabled info user OR either department engineer OR enabled management/admin | To order |
| Receive / direct handover | All INVITE employees | Placed order with remaining quantity |
| Pick up | All INVITE employees | Positive shelf quantity |
| Report/match unknown parcel | All INVITE employees | Match requires outstanding order quantity |
| Reply | Original requester or admin | Changes requested |
| Correct status | Either department engineer, enabled management user or enabled admin | Valid controlled correction, reason and confirmation |

Engineers can order requests from any requester in their assigned department. They do not have to be the request's author. Info membership grants ordering, not engineering approval. Management and admin have decisions, ordering and corrections across all departments. Only admin has configuration authority. Roles combine when a person has multiple memberships; either department engineer can act without waiting for the other.

**Permission design for the later implementation:** SharePoint's permission scopes include site, list and item; a permission granting item editing is not a separate permission to edit only receipt fields. Consequently, giving every employee direct Edit access to Ordering Requests would let them bypass the app's approval restrictions. Hiding buttons does not solve this. See [Microsoft permission levels](https://learn.microsoft.com/en-us/sharepoint/understanding-permission-levels).

Recommended direction: employees read the records and submit actions through an authenticated server-side handler; that handler checks roles, status, quantity limits and concurrency before making privileged writes. This allows everyone to perform practical warehouse actions without letting everyone directly overwrite approval/order fields. SPFx client code alone is not the security boundary. Re-read enabled role memberships in the trusted handler; never trust a client role name. The prototype info persona is not a production authorization shortcut. The exact backend/Power Automate action route is a later implementation decision, not something to configure now.

Config lists: only authorized admins/site owners edit. Management and info membership do not grant configuration editing. History: employees read, trusted writer appends; normal employees cannot edit/delete events. During schema preparation, keep writes owner-only and provide employee read access. This is a preparation state, not the final working submission flow. Inspect inherited permissions: adding Read does not remove existing Edit rights. Microsoft explains [list permission customization](https://support.microsoft.com/en-us/sharepoint/lists/sharepoint-sharing-and-permissions/customize-permissions-for-a-sharepoint-list-or-library).

## 11. Status, quantities and retention

- Approval writes To order directly. Map the prototype's internal Approved value to To order if data is ever imported; do not create two equivalent statuses.
- After ordering, use per-item quantities to derive display status: Picked up if every ordered line is fully received and collected; otherwise On shelf if any shelf stock exists; otherwise Ordered. Preserve Requested, To order, Changes requested and Rejected before applying delivery rules.
- Ordered queue = HasOutstandingDelivery = Yes, including a request whose display status is On shelf. Ordered card uses that same request-level predicate and counts each request once.
- On shelf queue = HasShelfStock = Yes. Both booleans are maintained by the future action handler, not SharePoint calculated columns across lists.
- Info banner counts all requests with RequestStatus = To order across all departments, independent of current dashboard filters. No banner for an empty queue.
- Default shared dashboard excludes Rejected and fully picked-up requests. Rejected filter shows RequestStatus = Rejected AND current time < RejectedVisibleUntil. My requests adds Requester = current user and includes recent rejections, with reason in details. No rejected dashboard card.
- At exactly RejectedAt + 15 days, hide a rejection from active app views. Keep the row and history. Archive/deletion automation is not part of this step.
- Picked up shows pickup/direct-handover events from the past 30 days, excluding void lots, grouped by OperationId where needed. Older events stay stored and available through the existing older-records view. FullyPickedUpAt alone cannot represent partial pickups.
- Corrections preserve audit snapshots and history, clear inappropriate current decision/order fields, and recompute stock flags. No deletion of request records to repair a mistake.
- Enforce 0 ≤ picked ≤ arrived ≤ ordered per ordered item, with lot quantities consistent with item totals. Conditional required fields and permission checks belong in the future trusted handler, not just the browser or a Power Automate notification after an invalid write.
- Writes across these lists are a multi-step operation. The integration must use operation/event keys, concurrency checks and retry/reconciliation handling so simultaneous receipts cannot over-receive and a failed write cannot leave double-counted stock. The schema alone does not implement those guarantees.

## 12. Create the lists manually

1. **Choose the intended SharePoint site.** Use a site you own or can manage, preferably a preparation/test site. Confirm two engineers per department, two initial info people, three management people and Aymane's actual admin identity. Keep the prototype and its sample data local.

2. **Create blank lists on that site.** Use Site contents → New → List → Blank list. Create, in this order: Ordering Department Engineers, Ordering Info Users, Ordering Management Users, Ordering Admin Users, Ordering Requests, Ordering Request Items, Ordering Delivery Lots, Ordering Unidentified Parcels (if wanted), Ordering Activity History. Same-site lookups link these lists. See Microsoft's [create a list](https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/create-a-list) and [lookup relationships](https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/create-list-relationships-by-using-lookup-columns) instructions.

3. **Rename the existing Title column.** Use List settings → Columns → Title and set the display label specified above. Keep its internal name Title. For other columns, use List settings → Create column, enter the exact internal name first, choose the type and save. Reopen the column and change its display name to the readable label. For example: create SupplierOrderNo, then display it as Supplier order number. Check the Field parameter in the column settings URL if you need to verify the internal name. See [create a column](https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/create-a-column-in-a-list-or-library).

4. **Apply the table settings.** Required Yes/No exactly as shown; People-only Person fields (Engineers multi-select; all actor and other configuration Person fields single-select); plain-text multiple-lines fields; correct Date-only versus Timestamp formats; numbers permit decimals; Choice values use exact spelling with fill-in disabled. Set the documented defaults. Required at a workflow step does not mean required when a new request is first created.

5. **Configure lookup columns.** Select the named source list and display column in each table. Use single-value lookups. Do not select extra projected columns unless needed. Enable Restrict delete for parent-child links where available; never Cascade delete business history. Create Ordering Activity History last so every optional lookup target already exists. Omit its Parcel lookup if skipping Ordering Unidentified Parcels.

6. **Set uniqueness and indexes.** Enforce unique values on Ordering Department Engineers.Title, Ordering Info Users.OrderingUser, Ordering Management Users.ManagementUser, Ordering Admin Users.AdminUser, Ordering Requests.RequestRef and Ordering Activity History.EventKey. RequestRef stays optional because ID-based references are populated after creation. Add non-unique indexes to Ordering Requests.Department, RequestStatus, Requester, HasOutstandingDelivery, HasShelfStock, RejectedVisibleUntil and SupplierOrderNo. Index Ordering Request Items.Request; Ordering Delivery Lots.RequestItem; Ordering Activity History.Request, PerformedAt, OperationId and ActionType; and optional Ordering Unidentified Parcels.ParcelStatus. Add an index through List settings → Indexed columns. These help targeted queries; they do not make an unbounded all-records query safe. The later app must page and filter requests and histories.

7. **Enable version history.** In each list's Versioning settings, enable a version whenever an item is edited and choose a retention count appropriate to your tenant. Leave SharePoint's built-in content approval off: the app's engineer decision is the business workflow, not SharePoint publishing approval. Do not configure automated rejection deletion or emails yet.

8. **Set preparation permissions.** Ensure all intended INVITE employees can read the lists, including configurations needed by the app. Avoid the “read only items created by the user” setting. Limit editing to designated owners during preparation; review inherited site-member Edit rights as explained above. Do not try to give different field permissions through list views. The final action-based write path will be implemented later.

9. **Enter configuration only.** Add three department rows with two Engineers each. Add two enabled Info Users rows, three enabled Management Users rows, and one enabled Admin Users row for Aymane. Keep the shared contact email info@invite-research.com on info rows. No department-specific order-person rows. Do not copy fictional people into production records.

10. **Create useful list views.** Use All items → Create new view, then Edit current view for filters and columns. Keep an owner review view of all records. The native views below help inspect lists; they do not replace the app's more precise combined filters. Microsoft documents [view filtering](https://support.microsoft.com/en-us/sharepoint/data-and-lists/use-filtering-to-modify-a-sharepoint-view).

    | Native view | List | Filter / useful columns |
    | --- | --- | --- |
    | Shared active | Ordering Requests | RequestStatus is not Rejected AND is not Picked up; show reference, title, department, requester, status, supplier number, expected date |
    | To order | Ordering Requests | RequestStatus = To order; show department, requester, recipient, title, reference |
    | Ordered | Ordering Requests | HasOutstandingDelivery = Yes; show supplier, supplier number, expected date and reference; line quantities are joined by the future app |
    | On shelf | Ordering Requests | HasShelfStock = Yes |
    | My requests | Ordering Requests | Requester = [Me]; basic native personal inspection view; the future app additionally applies active/15-day visibility rules |
    | Recent rejected | Ordering Requests | RequestStatus = Rejected AND RejectedVisibleUntil > [Today]; show reason and rejected date |
    | Request activity | Ordering Activity History | Show Request, ActionType, PerformedBy, PerformedAt, Quantity; newest first |
    | Unidentified | Ordering Unidentified Parcels | ParcelStatus = Unidentified |

    Native [Today] filtering is date-based, not the app's exact 15-day timestamp cutoff. Do not use a calculated TODAY column to implement rolling expiry. The future app must compare RejectedVisibleUntil against the actual current timestamp. Complex mixed personal/retention logic and the 30-day pickup view will be implemented in the app, not assumed to work through a simple native view.

11. **Check a small fictional example in a test site only.** Create an owner-entered request and one item line; ensure lookups select the correct parent, Person fields resolve, and unit/quantity/date values save. Manually supplied test data does not exercise future workflow authorization. Leave real operational records empty until integration is ready.

12. **Record setup details for the migration.** Save site URL, list names and list GUIDs (available in list-settings URLs), internal column names, actual engineer assignments, and the individual people behind info. Share the schema details when ready; do not share passwords or tokens. Stop here: no app connection, flow, emails or deployment yet.

## 13. What stays for the implementation step

Replace sample identity with the authenticated SPFx/current-user context, local roles with the four configuration lists, and local storage with a repository backed by these lists and a trusted action handler. Retain the approved screens and person/action distinction. Power Automate notifications, an optional delivery outbox, final write permissions and any archive/delete policy are separate implementation decisions; this schema creates none of them.

Before connecting: confirm role enforcement outside the browser, safe multi-list retries, decimal quantity limits, all-department read access, distinct receipt/pickup actors, rejection expiry, info's all-department queue, and preservation of the full normal/direct/partial workflows.
