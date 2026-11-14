import {
  roleFor,
  departmentRoles,
  infoUsers,
  managementUsers,
  adminUsers,
  isAdmin,
  isGlobalApprover,
  isDepartmentEngineer,
  isInfoUser,
  sharedOrderingAccount,
} from "./departmentRoles";
export { departmentRoles, roleFor, sharedOrderingAccount };
export const departments = [
  "Automation",
  "Robotics",
  "Formulation Technology",
] as const;
export type Department = (typeof departments)[number];
export const engineers = Object.fromEntries(
  departmentRoles.map((r) => [r.department, r.engineers.join(", ")]),
) as Record<Department, string>;
export const people = [
  "Yash Junnarkar",
  "Alphin Francis",
  "Marianne Baransi",
  ...departmentRoles.flatMap((r) => r.engineers),
  ...[...infoUsers, ...managementUsers, ...adminUsers].map((r) => r.person),
];
export type Activity = {
  at: string;
  by: string;
  text: string;
  before?: {
    stage: Request["stage"];
    items: Item[];
    supplier: string;
    reference: string;
    orderedAt: string;
    expected: string;
    rejectedAt?: string;
    rejectionReason?: string;
  };
};
export type Delivery = {
  quantity: number;
  picked: number;
  shelf: string;
  at: string;
  by: string;
};
export type Collection = {
  id: string;
  quantity: number;
  at: string;
  by: string;
  collector: string;
  method: "Shelf pickup" | "Direct handover";
};
export type Item = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  requestedQuantity?: number;
  link: string;
  received: number;
  picked: number;
  deliveries: Delivery[];
  collections: Collection[];
};
export type Request = {
  id: string;
  department: Department;
  requester: string;
  recipient: string;
  needed: string;
  stage:
    "Requested" | "Changes requested" | "Rejected" | "Approved" | "Ordered";
  items: Item[];
  supplier: string;
  reference: string;
  orderedAt: string;
  expected: string;
  orderComment?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  history: Activity[];
};
export type Parcel = {
  id: string;
  label: string;
  sender: string;
  shelf: string;
  at: string;
  by: string;
  resolved?: string;
  history: Activity[];
};
export type Demo = { requests: Request[]; parcels: Parcel[] };
export const stamp = () => new Date().toISOString();
export const round = (n: number) => Math.round(n * 1e6) / 1e6;
export const sum = (r: Request, k: "quantity" | "received" | "picked") =>
  round(r.items.reduce((a, i) => a + i[k], 0));
export const shelfQty = (r: Request) =>
  round(sum(r, "received") - sum(r, "picked"));
export const age = (at: string) =>
  Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 86400000));
export function status(r: Request): string {
  if (r.stage === "Approved") return "To order";
  if (r.stage !== "Ordered") return r.stage;
  if (sum(r, "picked") === sum(r, "quantity")) return "Picked up";
  return shelfQty(r) > 0 ? "On shelf" : "Ordered";
}
export const rejectionDate = (r: Request) =>
  r.rejectedAt ||
  [...r.history].reverse().find((h) => h.text.startsWith("Rejected"))?.at ||
  "";
export const recentRejection = (r: Request, now = Date.now()) =>
  r.stage === "Rejected" && Date.parse(rejectionDate(r)) > now - 15 * 86400000;
export const active = (r: Request, now = Date.now()) =>
  status(r) !== "Picked up" &&
  (r.stage !== "Rejected" || recentRejection(r, now));
// A partially arrived request stays in receiving even while some stock is on shelf.
export const awaitingDelivery = (r: Request) =>
  r.stage === "Ordered" && r.items.some((i) => i.received < i.quantity);
export const canAct = (r: Request, person: string, action: string) => {
  if (!people.includes(person)) return false;
  const assigned =
    isDepartmentEngineer(r.department, person) || isGlobalApprover(person);
  if (action === "correct") return assigned;
  if (["approve", "reject", "changes"].includes(action))
    return assigned && r.stage === "Requested";
  if (action === "order")
    return (isInfoUser(person) || assigned) && r.stage === "Approved";
  if (["shelf", "direct"].includes(action))
    return r.stage === "Ordered" && sum(r, "received") < sum(r, "quantity");
  if (action === "pickup") return r.stage === "Ordered" && shelfQty(r) > 0;
  if (action === "respond")
    return (
      (r.requester === person || isAdmin(person)) &&
      r.stage === "Changes requested"
    );
  return false;
};
function authorize(r: Request, by: string, action: string) {
  if (!canAct(r, by, action))
    throw Error(
      "This action is not available for this person or request stage.",
    );
}
export function decide(
  r: Request,
  by: string,
  action: "approve" | "reject" | "changes",
  reason = "",
): Request {
  authorize(r, by, action);
  if (action !== "approve" && !reason.trim())
    throw Error("Please enter a reason.");
  const stage =
    action === "approve"
      ? "Approved"
      : action === "reject"
        ? "Rejected"
        : "Changes requested";
  return {
    ...r,
    stage,
    rejectedAt: action === "reject" ? stamp() : undefined,
    rejectionReason: action === "reject" ? reason.trim() : undefined,
    history: [
      ...r.history,
      {
        at: stamp(),
        by,
        text:
          (stage === "Approved" ? "Approved → To order" : stage) +
          (reason ? ": " + reason : "."),
      },
    ],
  };
}
export function placeOrder(
  r: Request,
  by: string,
  fields: {
    supplier: string;
    reference: string;
    orderedAt: string;
    expected: string;
    quantities?: Record<string, number>;
    comment?: string;
  },
): Request {
  authorize(r, by, "order");
  if (
    !fields.supplier.trim() ||
    !fields.reference.trim() ||
    !fields.orderedAt ||
    !fields.expected
  )
    throw Error(
      "Enter a supplier, supplier order number, order date and expected delivery date.",
    );
  if (fields.expected && fields.expected < fields.orderedAt)
    throw Error("Expected delivery cannot be before the order date.");
  const items = r.items.map((i) => {
    const quantity = fields.quantities?.[i.id] ?? i.quantity;
    validateQuantity(quantity, Number.MAX_SAFE_INTEGER);
    return {
      ...i,
      requestedQuantity: i.requestedQuantity ?? i.quantity,
      quantity,
    };
  });
  return {
    ...r,
    supplier: fields.supplier,
    reference: fields.reference,
    orderedAt: fields.orderedAt,
    expected: fields.expected,
    items,
    orderComment: fields.comment?.trim() || "",
    stage: "Ordered",
    history: [
      ...r.history,
      {
        at: stamp(),
        by,
        text: `Ordered from ${fields.supplier} · ${fields.reference}. ${items.map((i) => `${i.name}: ${i.quantity} ${i.unit} ordered (${i.requestedQuantity} requested)`).join("; ")}.${fields.comment?.trim() ? ` Note: ${fields.comment.trim()}` : ""}`,
      },
    ],
  };
}
function validateQuantity(quantity: number, available: number) {
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    round(quantity) !== quantity ||
    quantity > round(available)
  )
    throw Error(
      "Enter a positive quantity within the available amount (up to 6 decimal places).",
    );
}
export function receive(
  r: Request,
  itemId: string,
  quantity: number,
  shelf: string,
  by: string,
  arrival?: { at: string; by: string },
): Request {
  authorize(r, by, "shelf");
  const item = r.items.find((i) => i.id === itemId);
  if (!item) throw Error("Choose an item.");
  validateQuantity(quantity, item.quantity - item.received);
  if (!shelf.trim()) throw Error("Enter a shelf location.");
  const at = arrival?.at || stamp();
  return {
    ...r,
    items: r.items.map((i) =>
      i.id === itemId
        ? {
            ...i,
            received: round(i.received + quantity),
            deliveries: [
              ...i.deliveries,
              {
                quantity,
                picked: 0,
                shelf: shelf.trim(),
                at,
                by: arrival?.by || by,
              },
            ],
          }
        : i,
    ),
    history: [
      ...r.history,
      {
        at: stamp(),
        by,
        text: `Placed on shelf: ${quantity} ${item.unit} of ${item.name} · ${shelf}.${arrival ? ` Parcel originally arrived ${arrival.at} and was registered by ${arrival.by}.` : ""}`,
      },
    ],
  };
}
export function pickup(
  r: Request,
  itemId: string,
  quantity: number,
  collector: string,
  by: string,
): Request {
  authorize(r, by, "pickup");
  const item = r.items.find((i) => i.id === itemId);
  if (!item) throw Error("Choose an item.");
  validateQuantity(quantity, item.received - item.picked);
  if (!collector.trim()) throw Error("Enter who collected the item.");
  let left = quantity;
  const deliveries = item.deliveries.map((d) => {
    const take = Math.min(left, round(d.quantity - d.picked));
    left = round(left - take);
    return { ...d, picked: round(d.picked + take) };
  });
  const at = stamp();
  const collection: Collection = {
    id: crypto.randomUUID(),
    quantity,
    at,
    by,
    collector,
    method: "Shelf pickup",
  };
  return {
    ...r,
    items: r.items.map((i) =>
      i.id === itemId
        ? {
            ...i,
            picked: round(i.picked + quantity),
            deliveries,
            collections: [...i.collections, collection],
          }
        : i,
    ),
    history: [
      ...r.history,
      {
        at,
        by,
        text: `Picked up: ${collector} collected ${quantity} ${item.unit} of ${item.name} from the shelf.`,
      },
    ],
  };
}
export function handover(
  r: Request,
  itemId: string,
  quantity: number,
  by: string,
): Request {
  authorize(r, by, "direct");
  const item = r.items.find((i) => i.id === itemId);
  if (!item) throw Error("Choose an item.");
  validateQuantity(quantity, item.quantity - item.received);
  const at = stamp();
  const collection: Collection = {
    id: crypto.randomUUID(),
    quantity,
    at,
    by,
    collector: r.recipient,
    method: "Direct handover",
  };
  return {
    ...r,
    items: r.items.map((i) =>
      i.id === itemId
        ? {
            ...i,
            received: round(i.received + quantity),
            picked: round(i.picked + quantity),
            collections: [...i.collections, collection],
          }
        : i,
    ),
    history: [
      ...r.history,
      {
        at,
        by,
        text: `Handed directly to ${r.recipient}: ${quantity} ${item.unit} of ${item.name}. Picked up without shelf storage.`,
      },
    ],
  };
}
export function collectedRows(
  requests: Request[],
  older = false,
  now = Date.now(),
) {
  const cutoff = now - 30 * 86400000;
  return requests
    .flatMap((request) =>
      request.items.flatMap((item) =>
        item.collections
          .filter((c) =>
            older ? Date.parse(c.at) < cutoff : Date.parse(c.at) >= cutoff,
          )
          .map((collection) => ({ request, item, collection })),
      ),
    )
    .sort((a, b) => Date.parse(b.collection.at) - Date.parse(a.collection.at));
}
const days = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
export function initialData(): Demo {
  const specs: [
    string,
    Department,
    Request["stage"],
    number,
    number,
    number,
    string,
    number,
  ][] = [
    [
      "Inductive proximity sensors",
      "Automation",
      "Ordered",
      10,
      6,
      4,
      "A-02",
      -2,
    ],
    ["Robot gripper fingers", "Robotics", "Requested", 2, 0, 0, "", 0],
    [
      "Glass reactor vessels, 500 ml",
      "Formulation Technology",
      "Ordered",
      4,
      4,
      0,
      "B-01",
      -3,
    ],
    ["DIN rail power supply, 24 V", "Automation", "Approved", 1, 0, 0, "", 0],
    ["Pneumatic quick connectors", "Robotics", "Ordered", 12, 0, 0, "", 0],
    [
      "Precision weighing boats",
      "Formulation Technology",
      "Requested",
      5,
      0,
      0,
      "",
      0,
    ],
    [
      "Ethernet industrial switch",
      "Automation",
      "Changes requested",
      1,
      0,
      0,
      "",
      0,
    ],
    ["Safety light curtain", "Robotics", "Ordered", 1, 1, 0, "A-04", -1],
    [
      "PTFE tubing, 6 mm",
      "Formulation Technology",
      "Approved",
      20,
      0,
      0,
      "",
      0,
    ],
    [
      "Calibration reference weights",
      "Formulation Technology",
      "Ordered",
      1,
      1,
      1,
      "B-03",
      -5,
    ],
    ["Legacy controller adapter", "Automation", "Rejected", 1, 0, 0, "", 0],
    [
      "Archived sample pipette stand",
      "Formulation Technology",
      "Ordered",
      1,
      1,
      1,
      "B-05",
      -35,
    ],
    ["USB programming cable", "Automation", "Requested", 1, 0, 0, "", 0],
  ];
  const requests = specs.map(
    ([name, department, stage, q, d, p, shelf, when], n): Request => {
      const requester = people[n % 3],
        recipient = n === 4 ? "Marianne Baransi" : n === 7 ? "Yash Junnarkar" : requester;
      const at = days(when);
      const by = people[(n + 1) % 3];
      const history: Activity[] = [
        {
          at: days(when - 14),
          by: requester,
          text: `Requested. Assigned engineer: ${engineers[department]}.`,
        },
      ];
      if (stage !== "Requested")
        history.push({
          at: days(when - 13),
          by: roleFor(department).engineers[0],
          text:
            stage === "Changes requested"
              ? "Changes requested: please confirm the required port count."
              : stage === "Rejected"
                ? "Rejected: incompatible with the current controller."
                : "Approved.",
        });
      if (stage === "Ordered")
        history.push({
          at: days(when - 12),
          by: infoUsers[0].person,
          text: `Ordered from fictional supplier by ${infoUsers[0].person}.`,
        });
      if (d && n !== 9)
        history.push({
          at: days(when - 1),
          by,
          text: `Placed on shelf: ${d} pcs · ${shelf}.`,
        });
      if (p)
        history.push({
          at,
          by,
          text:
            n === 9
              ? `Handed directly to ${recipient}: ${p} pcs. Picked up without shelf storage.`
              : `Picked up: ${recipient} collected ${p} pcs.`,
        });
      return {
        id: `INV-${1042 + n}`,
        department,
        requester,
        recipient,
        needed: n % 2 ? days(10).slice(0, 10) : "",
        stage,
        items: [
          {
            id: `item-${n}`,
            name,
            quantity: q,
            unit: n === 8 ? "m" : "pcs",
            link: "https://example.com/sample-product",
            received: d,
            picked: p,
            deliveries:
              d && n !== 9
                ? [{ quantity: d, picked: p, shelf, at: days(when - 1), by }]
                : [],
            collections: p
              ? [
                  {
                    id: `collection-${n}`,
                    quantity: p,
                    at,
                    by,
                    collector: recipient,
                    method: n === 9 ? "Direct handover" : "Shelf pickup",
                  },
                ]
              : [],
          },
        ],
        supplier: stage === "Ordered" ? "INVITE Demo Supplier" : "",
        reference: stage === "Ordered" ? `PO-DEMO-${820 + n}` : "",
        orderedAt: stage === "Ordered" ? days(when - 12).slice(0, 10) : "",
        expected: stage === "Ordered" ? days(3).slice(0, 10) : "",
        history,
      };
    },
  );
  return {
    requests,
    parcels: [
      {
        id: "PAR-001",
        label: "Small brown parcel · label partly damaged",
        sender: "LabSupply Demo",
        shelf: "U-01",
        at: days(-2),
        by: "Alphin Francis",
        history: [
          {
            at: days(-2),
            by: "Alphin Francis",
            text: "Unidentified parcel placed on shelf U-01.",
          },
        ],
      },
    ],
  };
}
