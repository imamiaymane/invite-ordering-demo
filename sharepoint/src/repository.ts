import { SharePointClient, unwrap, pageValues } from "./client";
import {
  lists,
  listPath,
  statuses,
  departments,
  type ListKey,
  type Row,
  type User,
} from "./config";
import { schema } from "./schema";
import { readRoles, type Roles } from "./roles";
export interface Field {
  InternalName: string;
  TypeAsString: string;
  FieldTypeKind?: number;
  AllowMultipleValues?: boolean | string;
  SchemaXml?: string;
  Choices?: string[] | { results: string[] };
  LookupList?: string;
  ReadOnlyField?: boolean;
}
function metadataBoolean(value: unknown): boolean | undefined {
  if (value === true || String(value).toLowerCase() === "true") return true;
  if (value === false || String(value).toLowerCase() === "false") return false;
  return undefined;
}
/** FieldTypeKind=20 identifies a Person field, not its single/multi cardinality. */
export function fieldTypeError(
  field: Field,
  expected: string,
): string | undefined {
  if (expected !== "User" && expected !== "UserMulti") {
    return field.TypeAsString === expected
      ? undefined
      : `expected ${expected}, found ${field.TypeAsString}`;
  }
  const person =
    field.TypeAsString === "User" ||
    field.TypeAsString === "UserMulti" ||
    field.FieldTypeKind === 20;
  if (!person) return `expected a Person field, found ${field.TypeAsString}`;
  // Inspect the opening Field element, not a Mult attribute on a nested element.
  const fieldElement = field.SchemaXml?.match(/<Field\b[^>]*>/i)?.[0];
  const xmlMult = fieldElement?.match(
    /\bMult\s*=\s*["'](true|false)["']/i,
  )?.[1];
  const property = metadataBoolean(field.AllowMultipleValues),
    xml = metadataBoolean(xmlMult);
  if (property !== undefined && xml !== undefined && property !== xml)
    return "conflicting AllowMultipleValues and SchemaXml Mult metadata; refresh and inspect field settings";
  const multiple =
    property ??
    xml ??
    (field.TypeAsString === "UserMulti"
      ? true
      : field.TypeAsString === "User"
        ? false
        : undefined);
  if (multiple === undefined)
    return "Person cardinality could not be determined from AllowMultipleValues / SchemaXml Mult";
  if (multiple !== (expected === "UserMulti"))
    return `expected ${expected === "UserMulti" ? "multiple" : "single"} Person selection, found ${multiple ? "multiple" : "single"} (AllowMultipleValues=${String(property)}, Mult=${String(xml)}, TypeAsString=${field.TypeAsString})`;
  return undefined;
}
export interface ListCheck {
  key: ListKey;
  list: string;
  readable: boolean;
  schemaValid: boolean;
  errors: string[];
  id?: string;
}
export interface ProbeResult {
  passed: boolean;
  checkedAt: string;
  user?: User;
  roles?: Roles;
  lists: ListCheck[];
  errors: string[];
  warnings: string[];
  writesEnabled: boolean;
}
const rolesQueries = {
  engineers:
    "$select=Id,Title,EngineersId,Engineers/Id,Engineers/Title,Engineers/EMail&$expand=Engineers&$top=100",
  info: "$select=Id,Title,OrderingUserId,OrderingUser/Id,OrderingUser/Title,OrderingUser/EMail,IsEnabled&$expand=OrderingUser&$top=100",
  management:
    "$select=Id,Title,ManagementUserId,ManagementUser/Id,ManagementUser/Title,ManagementUser/EMail,IsEnabled&$expand=ManagementUser&$top=100",
  admins:
    "$select=Id,Title,AdminUserId,AdminUser/Id,AdminUser/Title,AdminUser/EMail,IsEnabled&$expand=AdminUser&$top=100",
} as const;
const lookups: Partial<Record<ListKey, Record<string, ListKey>>> = {
  items: { Request: "requests" },
  lots: { RequestItem: "items" },
  history: {
    Request: "requests",
    RequestItem: "items",
    DeliveryLot: "lots",
    Parcel: "parcels",
  },
  parcels: { MatchedRequestItem: "items", MatchedDeliveryLot: "lots" },
};
const normalizeGuid = (s: string) => s.replace(/[{}]/g, "").toLowerCase();
/** Async repository intentionally separate from the synchronous local DemoRepository. */
export class SharePointRepository {
  private successfulProbe = false;
  constructor(
    readonly client: SharePointClient,
    private readonly permitTestWrites = false,
  ) {}
  async currentUser(): Promise<User> {
    const user = await this.client.get<User>(
      "web/currentuser?$select=Id,Title,Email,LoginName",
    );
    if (!Number.isInteger(user.Id) || user.Id <= 0 || !user.LoginName)
      throw new Error(
        "Authenticated SharePoint current user could not be resolved.",
      );
    return user;
  }
  rows<T extends Row = Row>(
    key: ListKey,
    query = "$select=*&$top=200",
  ): Promise<T[]> {
    return this.client.all<T>(`${listPath(key)}/items?${query}`);
  }
  async item<T extends Row = Row>(
    key: ListKey,
    id: number,
  ): Promise<{ row: T; etag: string }> {
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid item ID.");
    const { body, etag } = await this.client.request(
      `${listPath(key)}/items(${id})`,
    );
    const row = unwrap<T>(body);
    const version =
      etag ??
      (row as any)["odata.etag"] ??
      (row as any)["@odata.etag"] ??
      (row as any).__metadata?.etag;
    if (!version)
      throw new Error("Missing ETag; cannot safely edit this record.");
    return { row, etag: version };
  }
  async roles(): Promise<Roles> {
    const [engineers, info, management, admins] = await Promise.all(
      (Object.keys(rolesQueries) as Array<keyof typeof rolesQueries>).map(
        (key) => this.rows(key, rolesQueries[key]),
      ),
    );
    return readRoles(engineers, info, management, admins);
  }
  async probe(): Promise<ProbeResult> {
    this.successfulProbe = false;
    const result: ProbeResult = {
      passed: false,
      checkedAt: new Date().toISOString(),
      lists: [],
      errors: [],
      warnings: [],
      writesEnabled: this.permitTestWrites,
    };
    try {
      result.user = await this.currentUser();
    } catch (e) {
      result.errors.push(`Current user: ${message(e)}`);
    }
    const fieldsByList = new Map<ListKey, Field[]>();
    result.lists = await Promise.all(
      (Object.keys(lists) as ListKey[]).map(async (key) => {
        const check: ListCheck = {
          key,
          list: lists[key],
          readable: false,
          schemaValid: false,
          errors: [],
        };
        try {
          const meta = await this.client.get<{ Id: string }>(
            `${listPath(key)}?$select=Id,Title`,
          );
          check.id = meta.Id;
          const fields = await this.client.all<Field>(
            `${listPath(key)}/fields?$select=InternalName,TypeAsString,FieldTypeKind,SchemaXml,ReadOnlyField&$top=200`,
          );
          fieldsByList.set(key, fields);
          // Derived Person metadata must be read before validating TypeAsString:
          // SharePoint can return User + AllowMultipleValues=true rather than UserMulti.
          for (const [name, type] of Object.entries(schema[key])) {
            if (!["Choice", "Lookup", "User", "UserMulti"].includes(type))
              continue;
            const field = fields.find((f) => f.InternalName === name);
            if (!field) continue;
            const detail = await this.client.get<Field>(
              `${listPath(key)}/fields/getbyinternalnameortitle('${name}')`,
            );
            Object.assign(field, detail);
          }
          for (const [name, type] of Object.entries(schema[key])) {
            const field = fields.find((f) => f.InternalName === name);
            if (!field)
              check.errors.push(`Missing internal column ${name} (${type}).`);
            else {
              const typeError = fieldTypeError(field, type);
              if (typeError) check.errors.push(`${name}: ${typeError}.`);
              if (field.ReadOnlyField)
                check.errors.push(`${name} is unexpectedly read-only.`);
            }
          }
          // Reading list metadata alone does not prove list item access. Empty arrays are a valid read.
          pageValues(
            (
              await this.client.request(
                `${listPath(key)}/items?$select=Id&$top=1`,
              )
            ).body,
          );
          check.readable = true;
        } catch (e) {
          check.errors.push(message(e));
        }
        check.schemaValid = check.errors.length === 0;
        return check;
      }),
    );
    const choices: Partial<Record<ListKey, Record<string, readonly string[]>>> =
      {
        requests: { RequestStatus: statuses, Department: departments },
        lots: { ArrivalMethod: ["On shelf", "Direct handover"] },
        parcels: { ParcelStatus: ["Unidentified", "Matched"] },
        history: {
          PreviousStatus: statuses,
          NewStatus: statuses,
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
        },
      };
    for (const check of result.lists) {
      const fields = fieldsByList.get(check.key) ?? [];
      for (const [name, expected] of Object.entries(choices[check.key] ?? {})) {
        const raw = fields.find((f) => f.InternalName === name)?.Choices;
        const actual = Array.isArray(raw) ? raw : (raw?.results ?? []);
        const missing = expected.filter((value) => !actual.includes(value));
        if (missing.length)
          check.errors.push(`${name} missing choices: ${missing.join(", ")}.`);
      }
      for (const [name, target] of Object.entries(lookups[check.key] ?? {})) {
        const lookup = fields.find((f) => f.InternalName === name)?.LookupList;
        const id = result.lists.find((l) => l.key === target)?.id;
        if (!lookup || !id || normalizeGuid(lookup) !== normalizeGuid(id))
          check.errors.push(`${name} must look up ${lists[target]}.`);
      }
      check.schemaValid = check.errors.length === 0;
    }
    try {
      result.roles = await this.roles();
      for (const d of departments)
        if (result.roles.departmentEngineers[d].length !== 2)
          result.warnings.push(
            `${d}: ${result.roles.departmentEngineers[d].length} configured engineer(s); two expected for final setup. A single test identity is allowed.`,
          );
      if (!result.roles.admins.length)
        result.warnings.push("No enabled app admin is configured.");
      if (!result.roles.info.length)
        result.warnings.push("No enabled info ordering user is configured.");
    } catch (e) {
      result.errors.push(`Role configuration: ${message(e)}`);
    }
    result.passed =
      !!result.user &&
      !!result.roles &&
      result.errors.length === 0 &&
      result.lists.every((l) => l.readable && l.schemaValid);
    this.successfulProbe = result.passed;
    return result;
  }
  assertWritesAllowed() {
    if (!this.permitTestWrites || !this.successfulProbe)
      throw new Error(
        "Writes disabled. Complete the live read-only probe first. A separate explicit test-write session is also required.",
      );
  }
  private validateFields(key: ListKey, fields: Record<string, unknown>) {
    for (const field of Object.keys(fields)) {
      const base = field.endsWith("Id") ? field.slice(0, -2) : field;
      if (
        !schema[key][field] &&
        !["User", "UserMulti", "Lookup"].includes(schema[key][base])
      )
        throw new Error(`Unknown/unsupported ${lists[key]} field: ${field}`);
    }
  }
  /** Low-level test writer, not a production permission boundary. Use WorkflowService for actions. */
  async create(key: ListKey, fields: Record<string, unknown>): Promise<Row> {
    this.assertWritesAllowed();
    this.validateFields(key, fields);
    return this.client.write(`${listPath(key)}/items`, fields);
  }
  async update(
    key: ListKey,
    id: number,
    fields: Record<string, unknown>,
    etag: string,
  ): Promise<void> {
    this.assertWritesAllowed();
    this.validateFields(key, fields);
    if (!Number.isInteger(id) || id <= 0 || !etag || etag === "*")
      throw new Error("Valid item ID and concrete ETag required.");
    await this.client.write(`${listPath(key)}/items(${id})`, fields, etag);
  }
  // No delete, list provisioning, permission change, or demo-data seeding API.
}
export function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
