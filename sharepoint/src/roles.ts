import {
  departments,
  lists,
  type Department,
  type Row,
  type User,
  type RequestRow,
} from "./config";
export interface Roles {
  departmentEngineers: Record<Department, number[]>;
  info: number[];
  management: number[];
  admins: number[];
}
type PersonValue = { Id?: unknown; Title?: unknown; EMail?: unknown };
function rawText(value: unknown): string {
  if (value === undefined) return "not returned";
  if (value === null) return "null";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function displayText(value: unknown): string {
  const unwrapped =
    value && typeof value === "object" && "results" in value
      ? (value as { results: unknown }).results
      : value;
  const values = Array.isArray(unwrapped) ? unwrapped : [unwrapped];
  const labels = values
    .filter((item): item is PersonValue => !!item && typeof item === "object")
    .map((item) => item.Title ?? item.EMail ?? item.Id)
    .filter((item) => item !== undefined && item !== null)
    .map(String);
  return labels.length ? labels.join("; ") : rawText(value);
}
function rowLabel(row: Row): string {
  return `row ID ${rawText(row.Id)} (${rawText(row.Title)})`;
}
function invalidPerson(
  listName: string,
  row: Row,
  field: string,
  rawId: unknown,
): Error {
  return new Error(
    `${listName} ${rowLabel(row)} — invalid Person field ${field}. Displayed person value: ${displayText(row[field])}; lookup/person ID (${field}Id): ${rawText(rawId)}.`,
  );
}
function personId(
  value: unknown,
  listName: string,
  row: Row,
  field: string,
): number {
  if (!Number.isInteger(value) || Number(value) <= 0)
    throw invalidPerson(listName, row, field, value);
  return Number(value);
}
export function readRoles(
  engineers: Row[],
  info: Row[],
  management: Row[],
  admins: Row[],
): Roles {
  const departmentEngineers = {} as Record<Department, number[]>;
  const issues: string[] = [];
  for (const department of departments) {
    const matches = engineers.filter((r) => r.Title === department);
    if (matches.length !== 1) {
      issues.push(
        `Expected exactly one Department Engineers row for ${department}; found ${matches.length}.`,
      );
      departmentEngineers[department] = [];
      continue;
    }
    // Explicitly use ONLY the new multi-person field; legacy Engineer/EngineerId is ignored.
    const raw = matches[0].EngineersId as number[] | { results: number[] };
    const values = Array.isArray(raw) ? raw : raw?.results;
    if (!Array.isArray(values) || values.length === 0) {
      issues.push(
        invalidPerson(lists.engineers, matches[0], "Engineers", raw).message,
      );
      departmentEngineers[department] = [];
      continue;
    }
    const validIds: number[] = [];
    for (const value of values) {
      try {
        validIds.push(
          personId(value, lists.engineers, matches[0], "Engineers"),
        );
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
    }
    departmentEngineers[department] = [...new Set(validIds)];
  }
  function members(rows: Row[], listName: string, field: string) {
    const enabledIds: number[] = [];
    for (const row of rows) {
      if (typeof row.IsEnabled !== "boolean") {
        issues.push(
          `${listName} ${rowLabel(row)} — invalid IsEnabled field. Value: ${rawText(row.IsEnabled)}; expected Yes/No (Boolean).`,
        );
      }
      try {
        const id = personId(row[`${field}Id`], listName, row, field);
        if (row.IsEnabled === true) enabledIds.push(id);
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
    }
    return [...new Set(enabledIds)];
  }
  const roles = {
    departmentEngineers,
    info: members(info, lists.info, "OrderingUser"),
    management: members(management, lists.management, "ManagementUser"),
    admins: members(admins, lists.admins, "AdminUser"),
  };
  if (issues.length)
    throw new Error(`Invalid role configuration:\n- ${issues.join("\n- ")}`);
  return roles;
}
export type Action =
  | "approve"
  | "reject"
  | "changes"
  | "order"
  | "correct"
  | "receive"
  | "pickup"
  | "respond"
  | "configure";
export function allowed(
  user: User,
  roles: Roles,
  action: Action,
  request?: RequestRow,
): boolean {
  const admin = roles.admins.includes(user.Id),
    global = admin || roles.management.includes(user.Id);
  if (action === "configure") return admin;
  if (!request) return false;
  const engineer =
    roles.departmentEngineers[request.Department]?.includes(user.Id) ?? false;
  if (action === "correct") return global || engineer;
  if (["approve", "reject", "changes"].includes(action))
    return (global || engineer) && request.RequestStatus === "Requested";
  if (action === "order")
    return (
      (global || engineer || roles.info.includes(user.Id)) &&
      request.RequestStatus === "To order"
    );
  if (action === "respond")
    return (
      (admin || request.RequesterId === user.Id) &&
      request.RequestStatus === "Changes requested"
    );
  return ["Ordered", "On shelf"].includes(request.RequestStatus); // Quantity checks occur in workflow service.
}
