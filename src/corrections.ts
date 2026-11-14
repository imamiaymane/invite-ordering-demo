import { canAct, stamp, status, sum, type Request } from "./model";
export const correctionTargets = [
  "Requested",
  "To order",
  "Ordered",
  "On shelf",
] as const;
export type CorrectionTarget = (typeof correctionTargets)[number];
/** Corrections are audited reversals, not unrestricted normal workflow actions. */
export function correctStatus(
  r: Request,
  by: string,
  target: CorrectionTarget,
  reason: string,
  shelf = "",
): Request {
  if (!canAct(r, by, "correct"))
    throw Error(
      "Only a department engineer, management or admin can correct this request.",
    );
  if (!correctionTargets.includes(target) || !reason.trim())
    throw Error("Choose a correction and enter a reason.");
  if (status(r) === target) throw Error("Choose a different status.");
  if (
    ["Ordered", "On shelf"].includes(target) &&
    (!r.supplier || !r.reference || !r.orderedAt)
  )
    throw Error(
      "An existing placed order is required. Return to To order to record a new order.",
    );
  if (target === "On shelf" && (sum(r, "received") <= 0 || !shelf.trim()))
    throw Error(
      "Returning collected stock requires a received quantity and shelf location.",
    );
  const at = stamp();
  const stage =
    target === "To order"
      ? "Approved"
      : target === "On shelf"
        ? "Ordered"
        : target;
  const before = {
    stage: r.stage,
    items: r.items,
    supplier: r.supplier,
    reference: r.reference,
    orderedAt: r.orderedAt,
    expected: r.expected,
    rejectedAt: r.rejectedAt,
    rejectionReason: r.rejectionReason,
  };
  const preOrder = ["Requested", "To order"].includes(target);
  const items = r.items.map((i) => ({
    ...i,
    quantity: preOrder ? (i.requestedQuantity ?? i.quantity) : i.quantity,
    received: target === "On shelf" ? i.received : 0,
    picked: 0,
    collections: [],
    deliveries:
      target === "On shelf" && i.received > 0
        ? [{ quantity: i.received, picked: 0, shelf: shelf.trim(), at, by }]
        : [],
  }));
  return {
    ...r,
    stage,
    items,
    rejectedAt: undefined,
    rejectionReason: undefined,
    ...(preOrder
      ? {
          supplier: "",
          reference: "",
          orderedAt: "",
          expected: "",
          orderComment: "",
        }
      : {}),
    history: [
      ...r.history,
      {
        at,
        by,
        text: `Status corrected: ${status(r)} → ${target}. Reason: ${reason.trim()}. ${target === "On shelf" ? "All recorded arrived quantities returned to shelf " + shelf + "." : "Arrival and pickup quantities reset; prior records retained in audit snapshot."}`,
        before,
      },
    ],
  };
}
