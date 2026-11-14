import {
  departments,
  type Department,
  type RequestRow,
} from "./adapter/config";
import { SharePointRepository, message } from "./adapter/repository";

export interface NewRequestItem {
  name: string;
  quantity: number;
  unit: string;
  productLink?: string;
}

export interface NewRequestInput {
  department: Department;
  recipientId?: number;
  neededDate?: string;
  items: NewRequestItem[];
}

const cleanRequired = (value: string, label: string): string => {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required.`);
  return clean;
};

const validateQuantity = (value: number): void => {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    Math.round(value * 1e6) / 1e6 !== value
  )
    throw new Error("Use a positive quantity with at most six decimal places.");
};
const operationKey = (): string =>
  globalThis.crypto?.randomUUID?.() ||
  `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * Narrow DEV write service. It exposes only request creation.
 * Approval, rejection, ordering, receiving, pickup and correction are absent.
 */
export class NewRequestService {
  private busy = false;
  private stoppedAfterFailure = false;

  public constructor(private readonly repository: SharePointRepository) {}

  private async findPartialRequests(userId: number): Promise<RequestRow[]> {
    const candidates = await this.repository.rows<RequestRow>(
      "requests",
      `$select=Id,Title,RequestRef,RequesterId,RequestStatus,Created&$filter=RequesterId eq ${userId} and RequestStatus eq 'Requested'&$orderby=Id desc&$top=200`,
    );
    const checks = await Promise.all(
      candidates.map(async (request) => {
        const [items, history] = await Promise.all([
          this.repository.rows("items", `$select=Id&$filter=RequestId eq ${request.Id}&$top=1`),
          this.repository.rows("history", `$select=Id&$filter=RequestId eq ${request.Id}&$top=1`),
        ]);
        return items.length === 0 && history.length === 0 ? request : undefined;
      }),
    );
    return checks.filter((request): request is RequestRow => !!request);
  }

  public async create(input: NewRequestInput): Promise<number> {
    this.repository.assertWritesAllowed();
    if (this.stoppedAfterFailure)
      throw new Error(
        "This write session stopped after an earlier failure. Refresh the Workbench and inspect the three lists before trying again.",
      );
    if (this.busy) throw new Error("The request is already being submitted.");
    if (!departments.includes(input.department))
      throw new Error("Choose a valid department.");
    if (!input.items.length) throw new Error("Add at least one item.");

    const items = input.items.map((item) => {
      const name = cleanRequired(item.name, "Item name");
      const unit = cleanRequired(item.unit, "Unit");
      validateQuantity(item.quantity);
      const productLink = item.productLink?.trim() || "";
      if (productLink && !/^https?:\/\//i.test(productLink))
        throw new Error("Product link must start with http:// or https://.");
      return { ...item, name, unit, productLink };
    });
    if (input.neededDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.neededDate))
      throw new Error("Choose a valid needed date.");

    this.busy = true;
    const operationId = operationKey();
    let createdRequestId: number | undefined;
    let createdReference = "";
    let referenceAssigned = false;
    let createdItemCount = 0;
    let historyCreated = false;
    try {
      const user = await this.repository.currentUser();
      const partialRequests = await this.findPartialRequests(user.Id);
      if (partialRequests.length)
        throw new Error(
          `Existing partial DEV request${partialRequests.length === 1 ? "" : "s"} must be reviewed before another request can be created: ${partialRequests
            .map(
              (request) =>
                `Ordering Requests ID ${request.Id}; reference ${String(request.RequestRef || `INV-${String(request.Id).padStart(6, "0")} (expected)`)}; title "${request.Title}"`,
            )
            .join(" | ")}. No records were modified. Manually resolve the partial record, refresh the Workbench, and then submit again.`,
        );
      const recipientId = input.recipientId ?? user.Id;
      if (!Number.isInteger(recipientId) || recipientId <= 0)
        throw new Error("Choose a valid SharePoint recipient.");

      const request = await this.repository.create("requests", {
        Title: items[0].name,
        Department: input.department,
        RequesterId: user.Id,
        RecipientId: recipientId,
        NeededDate: input.neededDate || null,
        RequestStatus: "Requested",
        HasOutstandingDelivery: false,
        HasShelfStock: false,
      });
      createdRequestId = request.Id;
      createdReference = `INV-${String(request.Id).padStart(6, "0")}`;
      const current = await this.repository.item("requests", request.Id);
      await this.repository.update(
        "requests",
        request.Id,
        { RequestRef: createdReference },
        current.etag,
      );
      referenceAssigned = true;

      for (const item of items) {
        await this.repository.create("items", {
          Title: item.name,
          RequestId: request.Id,
          RequestedQty: item.quantity,
          OrderedQty: null,
          ArrivedQty: 0,
          PickedUpQty: 0,
          Unit: item.unit,
          ProductLink: item.productLink
            ? { Url: item.productLink, Description: item.name }
            : null,
        });
        createdItemCount += 1;
      }

      await this.repository.create("history", {
        Title: `Request ${createdReference} created`,
        EventKey: `${operationId}:requested`,
        OperationId: operationId,
        RequestId: request.Id,
        ActionType: "Requested",
        NewStatus: "Requested",
        PerformedById: user.Id,
        PerformedAt: new Date().toISOString(),
      });
      historyCreated = true;
      return request.Id;
    } catch (error) {
      this.stoppedAfterFailure = true;
      const partial = createdRequestId
        ? ` SharePoint parent exists: Ordering Requests ID ${createdRequestId}; reference ${createdReference}${referenceAssigned ? "" : " (reference update was not confirmed)"}. Completed child writes: ${createdItemCount}/${items.length} Ordering Request Items; Activity History: ${historyCreated ? "created" : "not created"}. Check these three DEV lists before retrying: Ordering Requests, Ordering Request Items, Ordering Activity History.`
        : " SharePoint did not return a created Ordering Requests ID, so parent creation was not confirmed. Check Ordering Requests before retrying in case SharePoint accepted the request but the response failed.";
      throw new Error(
        `Request creation stopped (operation ${operationId}): ${message(error)}${partial} No automatic retry or deletion was performed. Do not retry until the DEV lists have been checked.`,
      );
    } finally {
      this.busy = false;
    }
  }
}
