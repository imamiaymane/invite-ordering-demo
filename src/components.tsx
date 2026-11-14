import { status, round, shelfQty, sum, type Request } from "./model";
import { ChevronRight, PackageSearch } from "lucide-react";
export const fmt = (d: string) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not specified";
export const dateTime = (d: string) =>
  new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function Badge({ value }: { value: string }) {
  const tones: Record<string, string> = {
    Requested: "amber",
    Approved: "green",
    "To order": "green",
    Ordered: "blue",
    "On shelf": "purple",
    "Picked up": "green",
    "Changes requested": "red",
    Rejected: "red",
    Unidentified: "amber",
  };
  return (
    <span className={"badge " + (tones[value] || "neutral")}>
      <i />
      {value}
    </span>
  );
}
export function RequestTable({
  requests,
  onSelect,
  shelf = false,
}: {
  requests: Request[];
  onSelect: (id: string) => void;
  shelf?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>REQUEST / ITEM</th>
            <th>DEPARTMENT</th>
            <th>REQUESTER / RECIPIENT</th>
            <th>STATUS</th>
            <th>{shelf ? "SHELF LOCATION" : "PROGRESS"}</th>
            <th>ACTION</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} onClick={() => onSelect(r.id)}>
              <td>
                <button className="table-item" onClick={() => onSelect(r.id)}>
                  <strong>
                    {r.items[0].name}
                    {r.items.length > 1 ? ` +${r.items.length - 1}` : ""}
                  </strong>
                  <small>{r.id}</small>
                </button>
              </td>
              <td>{r.department}</td>
              <td>
                {r.requester}
                {r.recipient !== r.requester && (
                  <small className="cell-note">For {r.recipient}</small>
                )}
              </td>
              <td>
                <Badge value={status(r)} />
                {r.stage === "Ordered" &&
                  sum(r, "received") > 0 &&
                  sum(r, "received") < sum(r, "quantity") && (
                    <small className="cell-note">Partial delivery</small>
                  )}
              </td>
              <td>
                {shelf ? (
                  r.items.flatMap((i) =>
                    i.deliveries
                      .filter((d) => d.quantity > d.picked)
                      .map((d, n) => (
                        <div key={i.id + n}>
                          <b>{d.shelf}</b> · {round(d.quantity - d.picked)}{" "}
                          {i.unit}
                        </div>
                      )),
                  )
                ) : (
                  <div className="quantities">
                    <strong>
                      {sum(r, "received")} / {sum(r, "quantity")} arrived
                    </strong>
                    <small>
                      {shelfQty(r)} on shelf · {sum(r, "picked")} picked up
                    </small>
                  </div>
                )}
              </td>
              <td>
                <button
                  className="row-open"
                  aria-label={`Open ${r.id}`}
                  onClick={() => onSelect(r.id)}
                >
                  Open <ChevronRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!requests.length && <Empty text="No requests match this view." />}
    </div>
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <PackageSearch size={28} />
      <p>{text}</p>
    </div>
  );
}

export function OrderedTable({
  requests,
  onSelect,
  onReceive,
}: {
  requests: Request[];
  onSelect: (id: string) => void;
  onReceive: (r: Request, action: "shelf" | "direct" | "partial") => void;
}) {
  return (
    <div className="table-scroll ordered-table">
      <table>
        <thead>
          <tr>
            <th>ITEM / INTERNAL REFERENCE</th>
            <th>DEPARTMENT</th>
            <th>REQUESTER</th>
            <th>ORDERED</th>
            <th>ARRIVED</th>
            <th>SUPPLIER ORDER NO.</th>
            <th>EXPECTED DELIVERY</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            const pending = r.items.filter((i) => i.received < i.quantity);
            return (
              <tr key={r.id} onClick={() => onSelect(r.id)}>
                <td>
                  <button className="table-item" onClick={() => onSelect(r.id)}>
                    {pending.map((i) => (
                      <strong key={i.id}>{i.name}</strong>
                    ))}
                    <small>{r.id}</small>
                  </button>
                  {pending.some((i) => i.received > 0) && (
                    <small className="cell-note">
                      Partial delivery · more expected
                    </small>
                  )}
                </td>
                <td>{r.department}</td>
                <td>{r.requester}</td>
                <td>
                  {pending.map((i) => (
                    <div key={i.id}>
                      {i.quantity} {i.unit}
                    </div>
                  ))}
                </td>
                <td>
                  {pending.map((i) => (
                    <div key={i.id}>
                      {i.received} {i.unit}
                      <small className="cell-note">
                        {round(i.quantity - i.received)} still due
                      </small>
                    </div>
                  ))}
                </td>
                <td>
                  {r.reference || "Not recorded"}
                  <small className="cell-note">{r.supplier}</small>
                </td>
                <td>{fmt(r.expected)}</td>
                <td>
                  <div
                    className="ordered-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="primary"
                      onClick={() => onReceive(r, "shelf")}
                    >
                      Placed on shelf
                    </button>
                    <button onClick={() => onReceive(r, "direct")}>
                      Handed directly to requester
                    </button>
                    <button onClick={() => onReceive(r, "partial")}>
                      Partial delivery
                    </button>
                    <button className="row-open" onClick={() => onSelect(r.id)}>
                      Open details
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!requests.length && (
        <Empty text="No orders awaiting delivery match your filters." />
      )}
    </div>
  );
}
