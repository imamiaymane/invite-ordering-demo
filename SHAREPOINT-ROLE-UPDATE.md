# Safe role-configuration update before connection

Yes: change the configuration now, before adding real people or connecting the app. Keep the existing business lists and their data/lookup IDs. No SharePoint connection or changes were made by the prototype update.

## Changes to the existing lists

| Existing list | Change now |
| --- | --- |
| Ordering Department Engineers | Add Engineers, a multi-person column; retire legacy Engineer after verification |
| Ordering Info Users | Keep one single-person OrderingUser per row; start with two enabled rows later |
| Ordering Requests | No column change needed for this role update |
| Ordering Request Items | No column change needed |
| Ordering Delivery Lots | No column change needed |
| Ordering Activity History | No column change needed; actors stay single-person |
| Ordering Unidentified Parcels | No column change needed |

Add **Ordering Management Users** and **Ordering Admin Users**. Do not recreate the seven existing lists just to change the role model.

## 1. Safely replace Engineer with Engineers

1. Open Ordering Department Engineers → Settings → List settings. Note the old Engineer column's internal name and any existing values, views, validation, formatting or flows that use it. We have not inspected your tenant.
2. Choose Create column. Enter **Engineers** exactly, type **Person or Group**, **Allow multiple selections = Yes**, **Allow selection of = People Only**. Do not enable unique values for this multi-person field. Microsoft supports multiple selections on Person columns: [column options](https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/list-and-library-column-types-and-options).
3. If existing rows have Engineer values, initially make Engineers optional, copy each existing person into Engineers, and verify the copies. If there are no populated rows, create it required immediately. Do not invent the second person to satisfy setup.
4. After existing rows are populated, make Engineers required. Keep three department rows, one each for Automation, Robotics and Formulation Technology. Later select both actual engineers in each row. Required enforces a nonempty field, not exactly two members; verify two per department during configuration.
5. Update configuration views to display Engineers. Make legacy Engineer optional so it no longer blocks saving. Keep it out of the default view during verification.
6. Once Engineers values are verified and no dependencies use Engineer, remove the obsolete Engineer column. If the list is empty and has no dependencies, you can do this immediately after checking the new column. Do not delete the whole list or its department rows.

Changing the existing Person column to allow multiple values is also possible where its settings permit it, but renaming its display label to Engineers leaves its internal name as Engineer. The new-column approach gives a clean internal name **Engineers** and a reversible transition. Internal names are fixed when created; see [Microsoft naming guidance](https://learn.microsoft.com/en-us/microsoft-365/community/sharepoint-naming-guidelines).

The future integration will read Engineers as an array of identities, never as a single Engineer value. ApprovedBy, OrderedBy, PerformedBy and other historical actor fields remain single-person: either engineer may act, but each event still has one initiating actor.

## 2. Keep Ordering Info Users simple

| Display name | Internal name | Type/settings | Required | Example |
| --- | --- | --- | --- | --- |
| Ordering label | Title | Existing Text; no unique constraint | Yes | info |
| Ordering user | OrderingUser | Person, People Only, single selection; unique | Yes | First real info employee |
| Enabled | IsEnabled | Yes/No; default Yes | Yes | Yes |
| Contact email | ContactEmail | Text | No | info@invite-research.com |

Keep existing internal names if they already match. Add missing columns only. Later add two rows, one per actual ordering person, both with the label info. Do not convert OrderingUser into a multi-person column. Additional rows support more ordering people later without changing the UI.

Keep **info** as the responsibility, shared contact address and prototype test persona. In SharePoint, audit the real signed-in person; a mailbox label does not replace their identity. Do not add the prototype-only info alias as an extra production user membership.

Future ordering email recipients: **info@invite-research.com plus the resolved email of every enabled OrderingUser**, with duplicates removed. ContactEmail is contact metadata, not a permission. No flow or email delivery is configured now.

## 3. Add Ordering Management Users

Create a blank list. Keep its built-in Title column and add the following:

| Display name | Internal name | Type/settings | Required | Example |
| --- | --- | --- | --- | --- |
| Label | Title | Existing Text; default Management | Yes | Management |
| Management user | ManagementUser | Person, People Only, single selection; unique | Yes | Actual management member |
| Enabled | IsEnabled | Yes/No; default Yes | Yes | Yes |

Later add three enabled rows. Management users can approve, reject, request changes, order and correct across all departments. They do not gain role-configuration administration from this membership.

## 4. Add Ordering Admin Users

| Display name | Internal name | Type/settings | Required | Example |
| --- | --- | --- | --- | --- |
| Label | Title | Existing Text; default Admin | Yes | Admin |
| Admin user | AdminUser | Person, People Only, single selection; unique | Yes | Aymane's actual resolved identity |
| Enabled | IsEnabled | Yes/No; default Yes | Yes | Yes |

Later add Aymane as the first enabled row. Admin can perform all app actions, correct records and manage configuration. Keep normal status/quantity validation; correcting a mistake remains an explicit audited action.

Create custom columns using the internal names first, then rename their display labels. Keep version history enabled on all four configuration lists. Configuration reads are available to app users; writes are restricted to admins/site owners. Adding an admin row does **not** automatically grant real SharePoint permissions: a site owner must grant the appropriate site/list access separately. Preserve at least one verified administrator and the site-owner recovery path.

## Final permission rules

| Capability | Employee | Either department engineer | Info user | Management | Admin |
| --- | --- | --- | --- | --- | --- |
| View/create/receive/shelf/pickup | All departments | All departments | All departments | All departments | All departments |
| Approve/reject/request changes | No | Own department | No | All departments | All departments |
| Order approved request | No | Own department | All departments | All departments | All departments |
| Correct status | No | Own department | No | All departments | All departments |
| Configure roles | No | No | No | No | Yes |

Permissions combine if a person has multiple roles. Either department engineer may approve independently; this is not sequential approval by two people. “Own department” refers to the request's department, not the requester's identity. Disabled membership rows confer no role. Management/admin still order only approved requests through the normal action.

Keep direct SharePoint permissions separate from these configuration rules. Broad list Edit access would let users bypass app action restrictions; the future trusted action handler must validate identity, enabled roles, department, status and quantities. SPFx button visibility alone is not enforcement. See [Microsoft permission scopes](https://learn.microsoft.com/en-us/sharepoint/understanding-permission-levels).

## Local prototype update

The existing person selector now includes these sample roles:

| Role | Local names |
| --- | --- |
| Automation engineers | Nora Beck, Felix Braun |
| Robotics engineers | Jonas Klein, Lina Vogel |
| Formulation Technology engineers | Elena Roth, David Sommer |
| Info ordering people | Olivia Park, Ben Keller; info remains a test persona |
| Management | Taylor Quinn, Morgan Reed, Robin Hart |
| Admin | Aymane |

Names other than the requested admin label are fictional. No accounts are created. Info people receive the all-department To order banner. Engineers have their departmental approval banner; management/admin have an all-department approval banner. Configuration stays in `src/departmentRoles.ts`; no new team/configuration screen or email system is added. Admin configuration authority is represented by `canConfigureRoles`; future configuration writes must enforce it server-side.

Before connecting, check: exactly three department rows with two engineers each; two info rows; three management rows; Aymane's admin row; correct internal names; single-person history fields; restricted configuration editing. If people are not yet ready, leave the new config lists empty rather than adding fictitious tenant identities. Use the updated SHAREPOINT-MIGRATION.md for the complete schema.
