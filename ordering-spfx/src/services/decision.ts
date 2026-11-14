import type { RequestRow } from "./adapter/config";
import { SharePointRepository, message } from "./adapter/repository";
import { allowed } from "./adapter/roles";

export type DecisionAction = "approve" | "reject";

const operationKey = (): string =>
  globalThis.crypto?.randomUUID?.() ||
  `decision-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Controlled DEV writer for approval and rejection only. */
export class DecisionService {
  private busy = false;
  private stoppedAfterFailure = false;

  public constructor(private readonly repository: SharePointRepository) {}

  public async decide(
    requestId: number,
    action: DecisionAction,
    note = "",
  ): Promise<void> {
    this.repository.assertWritesAllowed();
    if (this.stoppedAfterFailure)
      throw new Error(
        "This decision session stopped after an earlier failure. Refresh the Workbench and inspect Ordering Requests and Ordering Activity History before trying another decision.",
      );
    if (this.busy) throw new Error("A decision is already being saved.");
    if (!Number.isInteger(requestId) || requestId <= 0)
      throw new Error("Invalid request ID.");
    const cleanNote = note.trim();
    if (action === "reject" && !cleanNote)
      throw new Error("Enter a rejection reason.");

    this.busy = true;
    const operationId = operationKey();
    let parentUpdated = false;
    let reference = `Request ID ${requestId}`;
    const newStatus = action === "approve" ? "To order" : "Rejected";
    try {
      const [user, roles, current] = await Promise.all([
        this.repository.currentUser(),
        this.repository.roles(),
        this.repository.item<RequestRow>("requests", requestId),
      ]);
      reference = String(current.row.RequestRef || reference);
      if (!allowed(user, roles, action, current.row))
        throw new Error(
          "You are not permitted to approve or reject this Requested item. Only its department engineers, management users, or admin users can decide it.",
        );

      const at = new Date().toISOString();
      const fields: Record<string, unknown> = {
        RequestStatus: newStatus,
      };
      if (action === "approve")
        Object.assign(fields, { ApprovedById: user.Id, ApprovedAt: at });
      else
        Object.assign(fields, {
          RejectedById: user.Id,
          RejectedAt: at,
          RejectionReason: cleanNote,
          RejectedVisibleUntil: new Date(Date.parse(at) + 15 * 86400000).toISOString(),
        });

      await this.repository.update("requests", requestId, fields, current.etag);
      parentUpdated = true;
      await this.repository.create("history", {
        Title:
          action === "approve"
            ? `Request ${reference} approved for ordering`
            : `Request ${reference} rejected`,
        EventKey: `${operationId}:${action}`,
        OperationId: operationId,
        RequestId: requestId,
        ActionType: action === "approve" ? "Approved" : "Rejected",
        PreviousStatus: current.row.RequestStatus,
        NewStatus: newStatus,
        PerformedById: user.Id,
        PerformedAt: at,
        ReasonNote: cleanNote || null,
      });
    } catch (error) {
      this.stoppedAfterFailure = true;
      const partial = parentUpdated
        ? ` Ordering Requests ID ${requestId} (${reference}) was updated to ${newStatus}, but its Activity History entry was not confirmed. Check both DEV lists before any manual action.`
        : ` Ordering Requests ID ${requestId} was not confirmed as updated. Check its current status and Activity History before retrying.`;
      throw new Error(
        `Decision stopped (operation ${operationId}): ${message(error)}${partial} No automatic retry, rollback, or deletion was performed.`,
      );
    } finally {
      this.busy = false;
    }
  }
}
