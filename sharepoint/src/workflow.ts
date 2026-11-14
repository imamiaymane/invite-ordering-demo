import {
  departments,
  type Department,
  type ItemRow,
  type LotRow,
  type RequestRow,
  type Row,
  type ListKey,
  type User,
} from "./config";
import { allowed, type Action, type Roles } from "./roles";
import { SharePointRepository, message } from "./repository";
type Fields = Record<string, unknown>;
const now = () => new Date().toISOString();
const positive = (value: number) => {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    Math.round(value * 1e6) / 1e6 !== value
  )
    throw new Error("Use a positive quantity with at most six decimals.");
};
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const text = (s: string) => {
  if (!s?.trim()) throw new Error("Required text is missing.");
  return s.trim();
};
/** Test-mode action service. Not an atomic server transaction or a production authorization boundary. */
export class WorkflowService {
  private stopped = false;
  private busy = false;
  constructor(private repo: SharePointRepository) {}
  async loadWorkspace() {
    const [user, roles, requests, items, lots, history, parcels] =
      await Promise.all([
        this.repo.currentUser(),
        this.repo.roles(),
        this.repo.rows<RequestRow>("requests"),
        this.repo.rows<ItemRow>("items"),
        this.repo.rows<LotRow>("lots"),
        this.repo.rows("history"),
        this.repo.rows("parcels"),
      ]);
    return { user, roles, requests, items, lots, history, parcels }; // Never fall back to local samples.
  }
  private async run<T>(
    work: (user: User, roles: Roles, operation: string) => Promise<T>,
  ): Promise<T> {
    this.repo.assertWritesAllowed();
    if (this.stopped)
      throw new Error(
        "Previous action failed. Inspect its operation and any partial records before starting another write session.",
      );
    if (this.busy)
      throw new Error("An action is already running in this service instance.");
    this.busy = true;
    const operation = crypto.randomUUID();
    try {
      return await work(
        await this.repo.currentUser(),
        await this.repo.roles(),
        operation,
      );
    } catch (e) {
      this.stopped = true;
      throw new Error(
        `Action ${operation} stopped: ${message(e)}. No automatic retry or deletion was performed; inspect for partial writes.`,
      );
    } finally {
      this.busy = false;
    }
  }
  private async authorize(
    id: number,
    action: Action,
    user: User,
    roles: Roles,
  ) {
    const found = await this.repo.item<RequestRow>("requests", id);
    if (!allowed(user, roles, action, found.row))
      throw new Error(`Not permitted: ${action} for this department/status.`);
    return found;
  }
  private async patch(key: ListKey, id: number, fields: Fields) {
    const { etag } = await this.repo.item(key, id);
    await this.repo.update(key, id, fields, etag);
  }
  private async event(
    user: User,
    operation: string,
    action: string,
    fields: Fields = {},
  ) {
    // Caller does not supply actor or event keys; identity comes from currentuser.
    await this.repo.create("history", {
      ...fields,
      Title: String(fields.Title ?? action),
      ActionType: action,
      OperationId: operation,
      EventKey: `${operation}:${crypto.randomUUID()}`,
      PerformedById: user.Id,
      PerformedAt: now(),
    });
  }
  private items(id: number) {
    return this.repo.rows<ItemRow>(
      "items",
      `$select=*&$filter=RequestId eq ${id}&$top=200`,
    );
  }
  async createRequest(input: {
    department: Department;
    recipientId?: number;
    neededDate?: string;
    items: {
      name: string;
      quantity: number;
      unit: string;
      productLink?: string;
    }[];
  }) {
    return this.run(async (user, _roles, op) => {
      if (!departments.includes(input.department) || !input.items.length)
        throw new Error("Choose a department and at least one item.");
      const recipient = input.recipientId ?? user.Id;
      if (!Number.isInteger(recipient) || recipient <= 0)
        throw new Error("Resolve the recipient to a SharePoint Person ID.");
      for (const item of input.items) {
        text(item.name);
        text(item.unit);
        positive(item.quantity);
        if (item.productLink && !/^https?:\/\//i.test(item.productLink))
          throw new Error("Product link must use HTTP(S).");
      }
      const request = await this.repo.create("requests", {
        Title: input.items[0].name.trim(),
        Department: input.department,
        RequesterId: user.Id,
        RecipientId: recipient,
        NeededDate: input.neededDate || null,
        RequestStatus: "Requested",
        HasOutstandingDelivery: false,
        HasShelfStock: false,
      });
      await this.patch("requests", request.Id, {
        RequestRef: `INV-${String(request.Id).padStart(6, "0")}`,
      });
      for (const item of input.items)
        await this.repo.create("items", {
          Title: item.name.trim(),
          RequestId: request.Id,
          RequestedQty: item.quantity,
          OrderedQty: null,
          ArrivedQty: 0,
          PickedUpQty: 0,
          Unit: item.unit.trim(),
          ProductLink: item.productLink
            ? { Url: item.productLink, Description: "Product" }
            : null,
        });
      await this.event(user, op, "Requested", {
        RequestId: request.Id,
        NewStatus: "Requested",
      });
      return request.Id;
    });
  }
  async decide(
    id: number,
    action: "approve" | "reject" | "changes",
    reason = "",
  ) {
    return this.run(async (user, roles, op) => {
      const { row, etag } = await this.authorize(id, action, user, roles);
      if (action !== "approve") text(reason);
      const at = now(),
        status =
          action === "approve"
            ? "To order"
            : action === "reject"
              ? "Rejected"
              : "Changes requested";
      const fields: Fields = { RequestStatus: status };
      if (action === "approve")
        Object.assign(fields, { ApprovedById: user.Id, ApprovedAt: at });
      if (action === "reject")
        Object.assign(fields, {
          RejectedById: user.Id,
          RejectedAt: at,
          RejectionReason: reason.trim(),
          RejectedVisibleUntil: new Date(
            Date.parse(at) + 15 * 86400000,
          ).toISOString(),
        });
      if (action === "changes") fields.ChangeRequestNote = reason.trim();
      await this.repo.update("requests", id, fields, etag);
      await this.event(user, op, action === "approve" ? "Approved" : status, {
        RequestId: id,
        PreviousStatus: row.RequestStatus,
        NewStatus: status,
        ReasonNote: reason,
      });
    });
  }
  async respond(id: number, reply: string) {
    return this.run(async (user, roles, op) => {
      text(reply);
      const { etag } = await this.authorize(id, "respond", user, roles);
      await this.repo.update(
        "requests",
        id,
        { RequestStatus: "Requested", ChangeRequestNote: null },
        etag,
      );
      await this.event(user, op, "Requester replied", {
        RequestId: id,
        PreviousStatus: "Changes requested",
        NewStatus: "Requested",
        ReasonNote: reply,
      });
    });
  }
  async order(
    id: number,
    input: {
      supplier: string;
      supplierOrderNo: string;
      orderDate: string;
      expectedDate: string;
      quantities: Record<number, number>;
      comment?: string;
    },
  ) {
    return this.run(async (user, roles, op) => {
      const { etag } = await this.authorize(id, "order", user, roles);
      const items = await this.items(id);
      text(input.supplier);
      text(input.supplierOrderNo);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(input.orderDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(input.expectedDate) ||
        input.expectedDate < input.orderDate
      )
        throw new Error("Valid order and expected dates required.");
      if (!items.length) throw new Error("Request has no item lines.");
      for (const i of items) positive(input.quantities[i.Id]);
      // Parent ETag detects stale decisions. Cross-list reconciliation is still required before production.
      await this.repo.update(
        "requests",
        id,
        {
          Supplier: input.supplier.trim(),
          SupplierOrderNo: input.supplierOrderNo.trim(),
          OrderDate: input.orderDate,
          ExpectedDate: input.expectedDate,
          OrderComment: input.comment ?? null,
          OrderedById: user.Id,
          OrderedAt: now(),
          RequestStatus: "Ordered",
          HasOutstandingDelivery: true,
        },
        etag,
      );
      for (const i of items)
        await this.patch("items", i.Id, { OrderedQty: input.quantities[i.Id] });
      await this.event(user, op, "Ordered", {
        RequestId: id,
        PreviousStatus: "To order",
        NewStatus: "Ordered",
        ReasonNote: input.comment ?? "",
        AfterData: JSON.stringify(input),
      });
    });
  }
  private async statusFromItems(id: number) {
    const items = await this.items(id);
    const remaining = items.some(
      (i) => round(Number(i.OrderedQty) - i.ArrivedQty) > 0,
    );
    const shelf = items.some((i) => round(i.ArrivedQty - i.PickedUpQty) > 0);
    const complete =
      items.length > 0 &&
      items.every(
        (i) =>
          Number(i.OrderedQty) > 0 &&
          round(i.PickedUpQty) === round(Number(i.OrderedQty)),
      );
    const status = complete ? "Picked up" : shelf ? "On shelf" : "Ordered";
    await this.patch("requests", id, {
      RequestStatus: status,
      HasOutstandingDelivery: remaining,
      HasShelfStock: shelf,
      FullyPickedUpAt: complete ? now() : null,
    });
    return status;
  }
  async receive(
    id: number,
    itemId: number,
    quantity: number,
    method: "On shelf" | "Direct handover",
    shelf = "",
  ) {
    return this.run(async (user, roles, op) => {
      const { row: request } = await this.authorize(id, "receive", user, roles);
      const { row: item, etag } = await this.repo.item<ItemRow>(
        "items",
        itemId,
      );
      positive(quantity);
      if (
        item.RequestId !== id ||
        quantity > round(Number(item.OrderedQty) - item.ArrivedQty)
      )
        throw new Error(
          "Invalid item or arrival exceeds outstanding quantity.",
        );
      if (!["On shelf", "Direct handover"].includes(method))
        throw new Error("Invalid arrival method.");
      if (method === "On shelf") text(shelf);
      const direct = method === "Direct handover",
        at = now();
      const lot = await this.repo.create("lots", {
        Title: `DEL-${op}`,
        RequestItemId: itemId,
        ArrivedQty: quantity,
        PickedUpQty: direct ? quantity : 0,
        ArrivalMethod: method,
        ShelfLocation: direct ? null : shelf.trim(),
        ArrivedById: user.Id,
        ArrivedAt: at,
        IsVoid: false,
      });
      await this.repo.update(
        "items",
        itemId,
        {
          ArrivedQty: round(item.ArrivedQty + quantity),
          PickedUpQty: round(item.PickedUpQty + (direct ? quantity : 0)),
        },
        etag,
      );
      const status = await this.statusFromItems(id);
      await this.event(
        user,
        op,
        direct ? "Direct handover" : "Placed on shelf",
        {
          RequestId: id,
          RequestItemId: itemId,
          DeliveryLotId: lot.Id,
          Quantity: quantity,
          Unit: item.Unit,
          ShelfLocation: direct ? null : shelf,
          CollectedById: direct ? request.RecipientId : null,
          PreviousStatus: request.RequestStatus,
          NewStatus: status,
        },
      );
    });
  }
  async pickup(
    id: number,
    itemId: number,
    quantity: number,
    collectedById: number,
  ) {
    return this.run(async (user, roles, op) => {
      const { row: request } = await this.authorize(id, "pickup", user, roles);
      const { row: item, etag } = await this.repo.item<ItemRow>(
        "items",
        itemId,
      );
      positive(quantity);
      if (
        !Number.isInteger(collectedById) ||
        collectedById <= 0 ||
        item.RequestId !== id ||
        quantity > round(item.ArrivedQty - item.PickedUpQty)
      )
        throw new Error("Invalid collector/item or insufficient shelf stock.");
      const lots = (
        await this.repo.rows<LotRow>(
          "lots",
          `$select=*&$filter=RequestItemId eq ${itemId}&$top=200`,
        )
      )
        .filter((l) => !l.IsVoid)
        .sort((a, b) => a.ArrivedAt.localeCompare(b.ArrivedAt));
      if (
        quantity >
        round(lots.reduce((n, l) => n + l.ArrivedQty - l.PickedUpQty, 0))
      )
        throw new Error("Item/lot stock mismatch; correction needed.");
      let left = quantity;
      const moves: { lot: LotRow; take: number }[] = [];
      for (const lot of lots) {
        const take = Math.min(left, round(lot.ArrivedQty - lot.PickedUpQty));
        if (take <= 0) continue;
        await this.patch("lots", lot.Id, {
          PickedUpQty: round(lot.PickedUpQty + take),
        });
        moves.push({ lot, take });
        left = round(left - take);
      }
      await this.repo.update(
        "items",
        itemId,
        { PickedUpQty: round(item.PickedUpQty + quantity) },
        etag,
      );
      const status = await this.statusFromItems(id);
      for (const { lot, take } of moves)
        await this.event(user, op, "Picked up", {
          RequestId: id,
          RequestItemId: itemId,
          DeliveryLotId: lot.Id,
          Quantity: take,
          Unit: item.Unit,
          ShelfLocation: lot.ShelfLocation,
          CollectedById: collectedById,
          PreviousStatus: request.RequestStatus,
          NewStatus: status,
        });
    });
  }
  async reportParcel(description: string, shelf: string, sender = "") {
    return this.run(async (user, _roles, op) => {
      const parcel = await this.repo.create("parcels", {
        Title: text(description),
        ShelfLocation: text(shelf),
        Sender: sender,
        ArrivedById: user.Id,
        ArrivedAt: now(),
        ParcelStatus: "Unidentified",
      });
      await this.event(user, op, "Parcel reported", { ParcelId: parcel.Id });
      return parcel.Id;
    });
  }
  async matchParcel(
    parcelId: number,
    id: number,
    itemId: number,
    quantity: number,
  ) {
    return this.run(async (user, roles, op) => {
      const { row: request } = await this.authorize(id, "receive", user, roles);
      const { row: parcel, etag: parcelTag } = await this.repo.item(
        "parcels",
        parcelId,
      );
      const { row: item, etag } = await this.repo.item<ItemRow>(
        "items",
        itemId,
      );
      positive(quantity);
      if (
        parcel.ParcelStatus !== "Unidentified" ||
        item.RequestId !== id ||
        quantity > round(Number(item.OrderedQty) - item.ArrivedQty)
      )
        throw new Error(
          "Parcel already matched, wrong item, or quantity exceeds outstanding amount.",
        );
      const lot = await this.repo.create("lots", {
        Title: `DEL-${op}`,
        RequestItemId: itemId,
        ArrivedQty: quantity,
        PickedUpQty: 0,
        ArrivalMethod: "On shelf",
        ShelfLocation: parcel.ShelfLocation,
        ArrivedById: parcel.ArrivedById,
        ArrivedAt: parcel.ArrivedAt,
        IsVoid: false,
      });
      await this.repo.update(
        "items",
        itemId,
        { ArrivedQty: round(item.ArrivedQty + quantity) },
        etag,
      );
      await this.repo.update(
        "parcels",
        parcelId,
        {
          ParcelStatus: "Matched",
          MatchedRequestItemId: itemId,
          MatchedDeliveryLotId: lot.Id,
          MatchedById: user.Id,
          MatchedAt: now(),
        },
        parcelTag,
      );
      const status = await this.statusFromItems(id);
      await this.event(user, op, "Parcel matched", {
        RequestId: id,
        RequestItemId: itemId,
        DeliveryLotId: lot.Id,
        ParcelId: parcelId,
        Quantity: quantity,
        Unit: item.Unit,
        ShelfLocation: parcel.ShelfLocation,
        PreviousStatus: request.RequestStatus,
        NewStatus: status,
      });
    });
  }
  async correct(
    id: number,
    target: "Requested" | "To order" | "Ordered" | "On shelf",
    reason: string,
    confirmed: boolean,
    shelf = "",
  ) {
    return this.run(async (user, roles, op) => {
      const { row: request, etag } = await this.authorize(
        id,
        "correct",
        user,
        roles,
      );
      text(reason);
      if (
        !confirmed ||
        !["Requested", "To order", "Ordered", "On shelf"].includes(target) ||
        target === request.RequestStatus
      )
        throw new Error("Choose a different correction target and confirm it.");
      if (
        ["Ordered", "On shelf"].includes(target) &&
        (!request.Supplier || !request.SupplierOrderNo || !request.OrderedAt)
      )
        throw new Error("An existing placed order is required.");
      const items = await this.items(id);
      if (
        target === "On shelf" &&
        (!shelf.trim() || !items.some((i) => i.ArrivedQty > 0))
      )
        throw new Error(
          "Returning stock requires arrived quantity and shelf location.",
        );
      const lots = (
        await Promise.all(
          items.map((i) =>
            this.repo.rows<LotRow>(
              "lots",
              `$select=*&$filter=RequestItemId eq ${i.Id}&$top=200`,
            ),
          ),
        )
      ).flat();
      // Persist correction evidence before replacing operational state; errors halt the test session.
      await this.event(user, op, "Status corrected", {
        RequestId: id,
        PreviousStatus: request.RequestStatus,
        NewStatus: target,
        ReasonNote: reason,
        BeforeData: JSON.stringify({ request, items, lots }),
        AfterData: JSON.stringify({ target, shelf, resetsPickup: true }),
      });
      for (const lot of lots.filter((l) => !l.IsVoid))
        await this.patch("lots", lot.Id, { IsVoid: true });
      const beforeOrder = target === "Requested" || target === "To order";
      for (const i of items) {
        await this.patch("items", i.Id, {
          ArrivedQty: target === "On shelf" ? i.ArrivedQty : 0,
          PickedUpQty: 0,
          ...(beforeOrder ? { OrderedQty: null } : {}),
        });
        if (target === "On shelf" && i.ArrivedQty > 0)
          await this.repo.create("lots", {
            Title: `COR-${op}-${i.Id}`,
            RequestItemId: i.Id,
            ArrivedQty: i.ArrivedQty,
            PickedUpQty: 0,
            ArrivalMethod: "On shelf",
            ShelfLocation: shelf,
            ArrivedById: user.Id,
            ArrivedAt: now(),
            IsVoid: false,
          });
      }
      await this.repo.update(
        "requests",
        id,
        {
          RequestStatus: target,
          RejectedById: null,
          RejectedAt: null,
          RejectionReason: null,
          RejectedVisibleUntil: null,
          FullyPickedUpAt: null,
          ChangeRequestNote: null,
          HasShelfStock: target === "On shelf",
          HasOutstandingDelivery:
            !beforeOrder &&
            items.some(
              (i) =>
                Number(i.OrderedQty) >
                (target === "On shelf" ? i.ArrivedQty : 0),
            ),
          ...(target === "Requested"
            ? { ApprovedById: null, ApprovedAt: null }
            : {}),
          ...(beforeOrder
            ? {
                Supplier: null,
                SupplierOrderNo: null,
                OrderedById: null,
                OrderedAt: null,
                OrderDate: null,
                ExpectedDate: null,
                OrderComment: null,
              }
            : {}),
        },
        etag,
      );
    });
  }
  async configure(
    key: "engineers" | "info" | "management" | "admins",
    fields: Fields,
    id?: number,
  ) {
    return this.run(async (user, roles, _op) => {
      if (!allowed(user, roles, "configure"))
        throw new Error("Only configured admins can edit configuration.");
      if (
        key === "engineers" &&
        ("Engineer" in fields || "EngineerId" in fields)
      )
        throw new Error(
          "Legacy Engineer is ignored; use EngineersId: { results: [person IDs] }.",
        );
      if (id) {
        await this.patch(key, id, fields);
        return id;
      }
      return (await this.repo.create(key, fields)).Id;
    });
  }
}
