# INVITE ordering mockup

Local React/Vite design preview with named sample people and browser-local data. Nothing is deployed. No SharePoint lists, flows, packages or real records are created.

## Run on another computer

Install Node.js (version 20 or newer) and Git, then clone this repository. In a terminal inside the cloned folder, run:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ on that computer. Keep the terminal open while presenting or testing. Browser data is stored separately on each computer, so the initial sample records appear on first launch. Stop the server with Ctrl+C.

## Preview

Run `npm run dev`, then open http://127.0.0.1:5173 in a browser. Screenshots are static; use this live address to test interactions. Dependencies are already installed in this workspace. Stop the server with Ctrl+C.

- Click anywhere on a request row, its item name, or **Open** to see its available actions and history.
- Keep the existing **Viewing as (sample person)** selector to test employees and engineers.
- Intern requesters: Yash Junnarkar (Automation), Alphin Francis (Robotics), and Marianne Baransi (Formulation Technology). They submit requests but cannot approve or order them.
- Department engineers: Jan Wiggeshoff (Automation), Marius Kling (Robotics), and Tim Lillotte (Formulation Technology). Each handles approvals and ordering for their department.
- Info users Elham Moghaddamas and Kamila Kalkin order across departments. Management (Carl-Helmut Coulon, Jan-Olav Henck, Maja Diebig-Lorenz) can handle decisions and ordering across departments. Admin Aymane Elimami has full workflow and configuration authority. Everyone can record arrivals and confirm pickups, subject to normal status and quantity checks.
- Reset demo data replaces the current browser's fictional records with the samples.

## Screens

| Screen | Purpose |
| --- | --- |
| Shared dashboard | All active requests and orders from all departments. Click a status card to filter. Rejected requests appear only when selecting Rejected in the status filter. When info is selected, an ordering banner counts all departments and opens the complete To order queue. |
| My requests | A personal filter for active requests submitted by the selected person. |
| To order | Approved requests waiting for info or the assigned department engineer to place the real supplier order. Search and department filters help find the next order to place. |
| Ordered | The delivery worklist: placed orders with quantity still due, including partially arrived orders. Department and search filters cover items, requesters, internal references and supplier order numbers. Row actions record shelf placement, direct handover or a partial delivery, or open details. |
| On shelf | All items physically waiting for collection. Anyone can record who picked them up. |
| Picked up | Collection events from the last 30 days, including direct handovers and partial collections. View older records retrieves older collections and original histories. |
| Unidentified parcels | Anyone can register an unknown parcel, then match it to any outstanding order. |

## Normal workflow

1. Any employee creates a request: department, item name, quantity, unit, optional link and needed date. Recipient defaults to requester. Selecting Ordering for someone else reveals the recipient selector.
2. The assigned engineer approves: **Requested → To order** (approved).
3. info or the assigned department engineer records supplier, supplier order number, order date, expected delivery date, ordered quantities and an optional comment: **To order → Ordered**. The actual purchase occurs outside this app.
4. Any employee chooses **Placed on shelf**, enters the location and confirms: **Ordered → On shelf**.
5. Any employee chooses **Picked up**, confirms who collected it: **On shelf → Picked up**.

Alternatively, **Handed directly to requester** records delivery and collection together without adding shelf stock: **Ordered → Picked up**. When ordering for another person, the confirmation names that intended recipient explicitly.

Each event records the acting person and timestamp. There is no general comment action. The original requester can reply and resubmit when an engineer requests changes.

The dashboard Ordered card opens the Ordered page. Its count and that page use the same rule and shared department/search filters: one row/count per placed order with at least one item still due. Only outstanding items appear in that row. A partial order can appear in both Ordered (remaining quantities) and On shelf (arrived stock). Once every item is received, it leaves Ordered; shelf stock stays in On shelf until collected.

## Exceptional cases and assumptions

- Arrival/pickup forms default to the full remaining quantity for the selected item. Record a partial quantity reveals the quantity field. Multi-item requests are supported, with movements recorded per item.
- Partial deliveries keep the simple primary status: On shelf if any stock remains there, otherwise Ordered while more is due. Separate arrived, shelf, picked-up and still-due figures show the quantities. Picked up requires every ordered item to be delivered and collected. Original requested quantities are retained separately; the actual ordered quantity determines what remains due. Separate backorders are not modeled.
- Rejection requires a reason. Rejected requests remain visible for 15 days in My requests and in the dashboard when its Rejected filter is selected. There is no rejected dashboard banner or card. Older rejections are hidden from active views but retained under View older rejected records; nothing is deleted. The rejection visibility policy is separate from storage so a future archive/delete policy can be decided independently.
- Correct status is available to the department engineer, management or Aymane Elimami (admin). It requires a reason and explicit confirmation. Corrections apply to the whole request, preserve its history and a snapshot of previous values, and reset arrival/pickup quantities when returning to Requested, To order or Ordered. Returning collected items to On shelf preserves received quantities and requires a shelf location. A placed order must already exist for an Ordered/On shelf correction. Normal approval and ordering actions remain restricted.
- Each partial collection appears separately in the Picked up view. Fully collected requests leave active views immediately; collection events remain in the recent view for 30 days, then appear only under View older records. No records or history are deleted. The cutoff is re-evaluated on load, changes and each minute while open.
- Pickup uses the oldest shelf stock first. Collection can be confirmed by any employee, recording the collector's name separately from the employee making the entry.
- One request is approved as a whole and has one supplier order. Multi-supplier splitting and returns are not implemented.
- Unknown parcels need no department assignment. Matching records the selected item quantity at the original shelf, preserving its original arrival time and registrar. One parcel matches one order item in this demo.
- Aggregate quantities add item units together; per-item figures are authoritative when units differ.
- Browser storage uses `invite-demo-v4` so the named sample records appear immediately. Earlier demo storage remains untouched and is not loaded.
- No emails are sent. Role selection and UI/action checks are design aids, not real security. Future SharePoint permissions must enforce shared read access and approval and shared-info/assigned-engineer ordering rules independently of the browser.

## Verification and source

`npm run build` validates TypeScript and creates the local build. `npm test` runs Playwright using installed Microsoft Edge. Tests cover the normal workflow, direct handover, shared-info/assigned-engineer ordering restrictions, ordered quantities, audited corrections, 15-day rejection visibility, partial quantities, unidentified parcels, replies, 30-day history, persistence and responsive layouts. Review screenshots are in `artifacts/`.

`src/model.ts` contains typed records, quantity/status logic and local action checks. `src/repository.ts` is the replaceable local storage adapter. `src/components.tsx` holds shared table/badge components. `src/main.tsx` contains the views and forms. Styles are in `src/styles.css` and `src/shared-flow.css`.

`src/departmentRoles.ts` provides typed Department / Engineer mappings and multiple engineer memberships and shared info ordering identities (display name `info`, future email `info@invite-research.com`) through a provider that can later read a SharePoint Department Roles list. `src/services.ts` separates the sample current-user provider from UI selection and produces in-memory notification flags for local feedback; these are placeholders for SPFx identity and Power Automate email delivery. `src/corrections.ts` owns the controlled correction policy and audit snapshots. None of these adapters connects to SharePoint yet.

Updated role schemas and safe manual changes are in [SHAREPOINT-ROLE-UPDATE.md](SHAREPOINT-ROLE-UPDATE.md). Prototype role configuration is in `src/departmentRoles.ts`; no new ordering-team or configuration screen is added. Future emails target the shared info address plus all enabled info users. No SharePoint lists were modified by this update.
