import {
  isAdmin,
  isManagement,
  isGlobalApprover,
  isDepartmentEngineer,
  isInfoUser,
  infoUsers,
  managementUsers,
  adminUsers,
} from "./departmentRoles";
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  ClipboardList,
  Archive,
  Check,
  PackageSearch,
  Plus,
  Search,
  X,
  ChevronRight,
  ArrowRight,
  RotateCcw,
  Box,
  ShoppingCart,
  ClipboardCheck,
  Truck,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
import {
  departments,
  people,
  engineers,
  roleFor,
  departmentRoles,
  sharedOrderingAccount,
  recentRejection,
  rejectionDate,
  status,
  sum,
  shelfQty,
  round,
  stamp,
  active,
  awaitingDelivery,
  canAct,
  decide,
  placeOrder,
  receive,
  pickup,
  handover,
  collectedRows,
  initialData,
  type Department,
  type Request,
  type Item,
  type Demo,
} from "./model";
import {
  Badge,
  RequestTable,
  OrderedTable,
  Empty,
  fmt,
  dateTime,
} from "./components";
import { localRepository } from "./repository";
import {
  correctStatus,
  correctionTargets,
  type CorrectionTarget,
} from "./corrections";
import { sampleCurrentUser, localNotifications } from "./services";
import "./styles.css";
import "./shared-flow.css";

const navigation = [
  ["Shared dashboard", LayoutDashboard],
  ["To order", ShoppingCart],
  ["My requests", ClipboardList],
  ["Ordered", Truck],
  ["On shelf", Archive],
  ["Picked up", Check],
  ["Unidentified parcels", PackageSearch],
] as const;
function App() {
  const [data, setData] = useState<Demo>(() => localRepository.load());
  const [page, setPage] = useState("Shared dashboard"),
    [actor, setActor] = useState(sampleCurrentUser.getCurrentUser()),
    [dept, setDept] = useState("All departments"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All active statuses"),
    [selected, setSelected] = useState<string | null>(null),
    [modal, setModal] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [editId, setEditId] = useState(""),
    [itemCount, setItemCount] = useState(1),
    [forOther, setForOther] = useState(false),
    [oldCollections, setOldCollections] = useState(false),
    [moveItem, setMoveItem] = useState(""),
    [partial, setPartial] = useState(false),
    [matchId, setMatchId] = useState(""),
    [now, setNow] = useState(Date.now());
  const [correctionTarget, setCorrectionTarget] =
    useState<CorrectionTarget>("Requested");
  const [olderRejected, setOlderRejected] = useState(false);
  const [notification, setNotification] = useState<ReturnType<
    typeof localNotifications.flag
  > | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);
  const current = data.requests.find((r) => r.id === selected),
    edit = data.requests.find((r) => r.id === editId);
  const assigned = departments.find((d) => isDepartmentEngineer(d, actor));
  const ordersFor =
    isInfoUser(actor) || isGlobalApprover(actor)
      ? [...departments]
      : assigned
        ? [assigned]
        : [];
  const save = (d: Demo) => {
    localRepository.save(d);
    setData(d);
    setNow(Date.now());
  };
  const update = (r: Request) =>
    save({
      ...data,
      requests: data.requests.map((x) => (x.id === r.id ? r : x)),
    });
  const notify = (s: string) => {
    setNotification(localNotifications.flag(s));
    setToast(s);
    window.setTimeout(() => setToast(""), 4000);
  };
  const open = (m: string) => {
    setError("");
    setPartial(false);
    if (m === "correct")
      setCorrectionTarget(
        current?.stage === "Requested" ? "To order" : "Requested",
      );
    if (current && ["shelf", "direct", "pickup"].includes(m))
      setMoveItem(
        current.items.find((i) =>
          m === "pickup" ? i.received > i.picked : i.quantity > i.received,
        )?.id || "",
      );
    if (m.startsWith("match:")) {
      const r = data.requests.find((r) => canAct(r, actor, "shelf"));
      setMatchId(r?.id || "");
      setMoveItem(r?.items.find((i) => i.quantity > i.received)?.id || "");
    }
    setModal(m);
  };
  const go = (p: string, f = "All active statuses") => {
    setPage(p);
    setFilter(f);
    setOldCollections(false);
    setOlderRejected(false);
  };
  const receiveFromOrder = (
    r: Request,
    action: "shelf" | "direct" | "partial",
  ) => {
    setSelected(r.id);
    setMoveItem(r.items.find((i) => i.received < i.quantity)?.id || "");
    setPartial(action === "partial");
    setError("");
    setModal(action === "direct" ? "direct" : "shelf");
  };
  const newRequest = () => {
    setEditId("");
    setForOther(false);
    setItemCount(1);
    open("request");
  };
  useEffect(() => {
    if (!modal && !selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(
      modal ? ".modal" : ".detail",
    );
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,a[href],summary",
        ) || [],
      ).filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        modal ? setModal("") : setSelected(null);
      }
      if (e.key === "Tab") {
        const els = focusable(),
          first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, [modal, selected]);
  const matches = (r: Request) =>
    (dept === "All departments" || r.department === dept) &&
    (!query ||
      [
        r.id,
        r.requester,
        r.recipient,
        r.supplier,
        r.reference,
        ...r.items.map((i) => i.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()));
  const filtered = data.requests.filter(matches);
  const live = filtered.filter((r) => active(r, now));
  const ordered = filtered.filter(awaitingDelivery);
  const toOrderCount = data.requests.filter(
    (r) => r.stage === "Approved",
  ).length;
  const rows = (
    filter === "Rejected"
      ? filtered.filter(
          (r) =>
            r.stage === "Rejected" &&
            (olderRejected
              ? !recentRejection(r, now)
              : recentRejection(r, now)),
        )
      : live.filter(
          (r) => page !== "Shared dashboard" || r.stage !== "Rejected",
        )
  )
    .filter(
      (r) =>
        filter === "All active statuses" ||
        (filter === "Ordered" ? awaitingDelivery(r) : status(r) === filter),
    )
    .filter((r) =>
      page === "My requests"
        ? r.requester === actor
        : page === "To order"
          ? r.stage === "Approved"
          : page === "On shelf"
            ? shelfQty(r) > 0
            : true,
    );
  const collections = collectedRows(filtered, oldCollections, now);
  const parcels = data.parcels.filter(
    (p) =>
      !p.resolved &&
      (!query ||
        [p.id, p.label, p.sender, p.shelf]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const metrics = [
    {
      name: "Requested",
      description: "Waiting for the assigned engineer",
      count: live.filter((r) => status(r) === "Requested").length,
      icon: ClipboardCheck,
      tone: "amber",
    },
    {
      name: "To order",
      description: "Approved · waiting for info or department engineer",
      count: live.filter((r) => r.stage === "Approved").length,
      icon: ShoppingCart,
      tone: "green",
    },
    {
      name: "Ordered",
      description: "Orders with quantity still expected",
      count: ordered.length,
      icon: Truck,
      tone: "blue",
    },
    {
      name: "On shelf",
      description: "Requests ready for collection",
      count: live.filter((r) => shelfQty(r) > 0).length,
      icon: Archive,
      tone: "purple",
    },
    {
      name: "Picked up",
      description: "Collections in the last 30 days",
      count: collectedRows(filtered, false, now).length,
      icon: Check,
      tone: "green",
    },
  ];
  const movementRequest = modal.startsWith("match:")
    ? data.requests.find((r) => r.id === matchId)
    : current;
  const movementItem = movementRequest?.items.find((i) => i.id === moveItem);
  const available = movementItem
    ? round(
        modal === "pickup"
          ? movementItem.received - movementItem.picked
          : movementItem.quantity - movementItem.received,
      )
    : 0;
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      v = (k: string) => String(f.get(k) || "");
    try {
      if (modal === "request") {
        if (edit && !canAct(edit, actor, "respond"))
          throw Error(
            "Only the original requester or admin can reply to this request.",
          );
        const department = v("department") as Department;
        if (!departments.includes(department))
          throw Error("Choose a department.");
        const items: Item[] = Array.from({ length: itemCount }, (_, n) => ({
          id: crypto.randomUUID(),
          name: v(`name${n}`).trim(),
          quantity: Number(v(`quantity${n}`)),
          unit: v(`unit${n}`),
          link: v(`link${n}`),
          received: 0,
          picked: 0,
          deliveries: [],
          collections: [],
        }));
        if (
          items.some(
            (i) =>
              !i.name ||
              !Number.isFinite(i.quantity) ||
              i.quantity <= 0 ||
              round(i.quantity) !== i.quantity,
          )
        )
          throw Error(
            "Each item needs a name and positive quantity, with up to 6 decimal places.",
          );
        if (edit && !v("reply").trim())
          throw Error("Please reply to the engineer.");
        const recipient = forOther ? v("recipient") : actor;
        if (!people.includes(recipient)) throw Error("Choose a recipient.");
        const r: Request = {
          id:
            edit?.id ||
            `INV-${Math.max(1054, ...data.requests.map((r) => Number(r.id.split("-")[1]))) + 1}`,
          department,
          requester: actor,
          recipient,
          needed: v("needed"),
          stage: "Requested",
          items,
          supplier: "",
          reference: "",
          orderedAt: "",
          expected: "",
          history: [
            ...(edit?.history || []),
            {
              at: stamp(),
              by: actor,
              text: edit
                ? `Reply to engineer: ${v("reply")}. Resubmitted as Requested to ${engineers[department]}.`
                : `Requested. Assigned engineer: ${engineers[department]}.`,
            },
          ],
        };
        if (edit) update(r);
        else save({ ...data, requests: [r, ...data.requests] });
        setSelected(r.id);
        notify(edit ? "Reply sent. Ready for review." : "Request submitted.");
      } else if (modal === "reset") {
        save(initialData());
        setSelected(null);
        notify("Fictional demo data restored.");
      } else if (modal === "parcel") {
        const at = stamp(),
          shelf = v("shelf").trim();
        save({
          ...data,
          parcels: [
            ...data.parcels,
            {
              id: `PAR-${Date.now()}`,
              label: v("label"),
              sender: v("sender") || "Unknown sender",
              shelf,
              at,
              by: actor,
              history: [
                {
                  at,
                  by: actor,
                  text: `Unidentified parcel placed on shelf ${shelf}.`,
                },
              ],
            },
          ],
        });
        notify("Unidentified parcel registered.");
      } else if (modal.startsWith("match:")) {
        const p = data.parcels.find((p) => p.id === modal.slice(6));
        const r = data.requests.find((r) => r.id === matchId);
        if (!p || p.resolved || !r) throw Error("Choose an outstanding order.");
        const quantity = partial ? Number(v("quantity")) : available;
        const next = receive(r, moveItem, quantity, p.shelf, actor, {
          at: p.at,
          by: p.by,
        });
        next.history.push({
          at: stamp(),
          by: actor,
          text: `Matched unidentified parcel ${p.id}.`,
        });
        save({
          ...data,
          requests: data.requests.map((x) => (x.id === r.id ? next : x)),
          parcels: data.parcels.map((x) =>
            x.id === p.id
              ? {
                  ...x,
                  resolved: r.id,
                  history: [
                    ...x.history,
                    {
                      at: stamp(),
                      by: actor,
                      text: `Matched to ${r.id}: ${quantity} ${movementItem?.unit}.`,
                    },
                  ],
                }
              : x,
          ),
        });
        notify("Parcel matched and shelf quantity recorded.");
      } else if (current) {
        if (["approve", "reject", "changes"].includes(modal)) {
          update(
            decide(
              current,
              actor,
              modal as "approve" | "reject" | "changes",
              v("reason"),
            ),
          );
          notify("Decision recorded.");
        } else if (modal === "order") {
          update(
            placeOrder(current, actor, {
              supplier: v("supplier"),
              reference: v("reference"),
              orderedAt: v("orderedAt"),
              expected: v("expected"),
              quantities: Object.fromEntries(
                current.items.map((i) => [i.id, Number(v("ordered-" + i.id))]),
              ),
              comment: v("orderComment"),
            }),
          );
          notify("Order recorded.");
        } else if (modal === "correct") {
          if (!f.get("confirmCorrection"))
            throw Error("Confirm the correction effects before saving.");
          update(
            correctStatus(
              current,
              actor,
              correctionTarget,
              v("reason"),
              v("shelf"),
            ),
          );
          notify("Correction saved with reason and audit history.");
        } else if (["shelf", "direct", "pickup"].includes(modal)) {
          const quantity = partial ? Number(v("quantity")) : available;
          update(
            modal === "shelf"
              ? receive(current, moveItem, quantity, v("shelf"), actor)
              : modal === "direct"
                ? handover(current, moveItem, quantity, actor)
                : pickup(current, moveItem, quantity, v("collector"), actor),
          );
          notify(
            modal === "shelf"
              ? "Placed on shelf."
              : modal === "direct"
                ? "Direct handover recorded as Picked up."
                : "Pickup recorded.",
          );
        }
      }
      setModal("");
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const actions = (r: Request) => (
    <div className="actions">
      {canAct(r, actor, "approve") && (
        <>
          <button className="primary" onClick={() => open("approve")}>
            <Check size={16} />
            Approve
          </button>
          <button onClick={() => open("reject")}>Reject</button>
          <button onClick={() => open("changes")}>Request changes</button>
        </>
      )}
      {canAct(r, actor, "order") && (
        <button className="primary" onClick={() => open("order")}>
          <ShoppingCart size={16} />
          Mark as ordered
        </button>
      )}
      {canAct(r, actor, "shelf") && (
        <>
          <button className="primary" onClick={() => open("shelf")}>
            <Archive size={16} />
            Placed on shelf
          </button>
          <button onClick={() => open("direct")}>
            Handed directly to requester
          </button>
        </>
      )}
      {canAct(r, actor, "pickup") && (
        <button className="primary" onClick={() => open("pickup")}>
          <Check size={16} />
          Picked up
        </button>
      )}
      {canAct(r, actor, "respond") && (
        <button
          className="primary"
          onClick={() => {
            setEditId(r.id);
            setForOther(r.recipient !== actor);
            setItemCount(r.items.length);
            open("request");
          }}
        >
          Reply to engineer
        </button>
      )}
      {canAct(r, actor, "correct") && (
        <button onClick={() => open("correct")}>Correct status</button>
      )}
    </div>
  );
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="workspace">
          <span className="workspace-icon">
            <Box size={21} />
          </span>
          <div>
            <strong>One shared workspace</strong>
            <small>All three departments</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation.map(([name, Icon]) => (
            <React.Fragment key={name}>
              {name === "Unidentified parcels" && (
                <div className="nav-label exception-label">EXCEPTIONS</div>
              )}
              <button
                className={page === name ? "active" : ""}
                onClick={() => {
                  go(name);
                }}
                aria-label={name}
                title={name}
              >
                <Icon size={19} />
                <span>{name}</span>
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="reset" onClick={() => open("reset")}>
            <RotateCcw size={16} />
            Reset demo data
          </button>
          <div className="sidebar-footer">
            INVITE · Design preview<small>Prototype v3.0</small>
          </div>
        </div>
      </aside>
      <div className="shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <span className="preview-tag">LOCAL DEMO</span>
        </header>
        <main>
          <div className="page-heading">
            <div className="eyebrow">
              INVITE OPERATIONS · SHARED BY ALL DEPARTMENTS
            </div>
            <div className="title-line">
              <div>
                <h1>
                  {page === "Shared dashboard"
                    ? "One place. Every order."
                    : page}
                </h1>
                <p>
                  {page === "Shared dashboard"
                    ? "Request it, order it, and follow it all the way to pickup."
                    : page === "To order"
                      ? "Approved requests waiting for info or a department engineer to place the real supplier order. Management and admin can also order."
                      : page === "Ordered"
                        ? "Find an order and record its arrival. Partial deliveries stay here until fully received."
                        : page === "My requests"
                          ? `A personal filter for requests submitted by ${actor}.`
                          : page === "On shelf"
                            ? "What is here, where it is, and who it is for."
                            : page === "Picked up"
                              ? "Recent collections and direct handovers. Older records stay in the history."
                              : "A place for arrivals that cannot yet be matched to an order."}
                </p>
              </div>
              <button className="primary" onClick={newRequest}>
                <Plus size={17} />
                New request
              </button>
            </div>
          </div>
          <section className="rolebar">
            <div className="role-description">
              <span className="role-icon">
                <ClipboardList size={20} />
              </span>
              <div>
                <strong>Everyone sees the shared list</strong>
                <span>Switch fictional people to try their actions.</span>
              </div>
            </div>
            <label className="identity-selector">
              Viewing as (sample person)
              <select
                aria-label="Sample person"
                value={actor}
                onChange={(e) => {
                  setActor(e.target.value);
                  setSelected(null);
                  setModal("");
                }}
              >
                {people.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <div className="identity-description">
              <strong>
                {isAdmin(actor)
                  ? "Admin"
                  : isManagement(actor)
                    ? "Management"
                    : assigned
                      ? `${assigned} engineer`
                      : ordersFor.length
                        ? "Shared ordering account"
                        : "INVITE employee"}
              </strong>
              <span>
                {isAdmin(actor)
                  ? "Full workflow access across all departments; administers role configuration."
                  : isManagement(actor)
                    ? "Approves, rejects, requests changes, orders and corrects across all departments."
                    : `${assigned ? "Approves/rejects " + assigned + ". " : ""}${ordersFor.length ? "Places orders for " + ordersFor.join(", ") + ". " : ""}Everyone can help with arrivals and pickups.`}
              </span>
            </div>
          </section>
          <div className="toolbar">
            <div className="filter-left">
              {page !== "Unidentified parcels" && (
                <select
                  aria-label="Filter department"
                  value={dept}
                  onChange={(e) => setDept(e.target.value)}
                >
                  <option>All departments</option>
                  {departments.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              )}
              <span className="live-dot" />
              <span className="local-label">Fictional data</span>
            </div>
            <div className="filter-right">
              <label className="search">
                <Search size={18} />
                <input
                  aria-label="Search"
                  placeholder="Search items, people or order reference…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {(query ||
                dept !== "All departments" ||
                filter !== "All active statuses") && (
                <button
                  onClick={() => {
                    setQuery("");
                    setDept("All departments");
                    setFilter("All active statuses");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
          {page === "Shared dashboard" && (
            <>
              <div className="workflow-guide">
                <span>Requested</span>
                <ChevronRight size={15} />
                <span>Approved / To order</span>
                <ChevronRight size={15} />
                <span>Ordered</span>
                <ChevronRight size={15} />
                <span>On shelf</span>
                <ChevronRight size={15} />
                <span>Picked up</span>
              </div>
              <div className="metrics simple-metrics">
                {metrics.map((m) => (
                  <button
                    className={"metric " + m.tone}
                    key={m.name}
                    onClick={() =>
                      go(
                        m.name === "To order"
                          ? "To order"
                          : m.name === "Ordered"
                            ? "Ordered"
                            : m.name === "On shelf"
                              ? "On shelf"
                              : m.name === "Picked up"
                                ? "Picked up"
                                : "Shared dashboard",
                        ["Picked up", "Ordered", "To order"].includes(m.name)
                          ? "All active statuses"
                          : m.name,
                      )
                    }
                  >
                    <div className="metric-top">
                      <span>{m.name}</span>
                      <m.icon size={20} />
                    </div>
                    <div className="metric-count">
                      {m.count}
                      <ArrowRight size={18} />
                    </div>
                    <div className="metric-desc">{m.description}</div>
                  </button>
                ))}
              </div>
              {(assigned || isGlobalApprover(actor)) && (
                <div className="review-banner">
                  <ClipboardCheck size={20} />
                  <span>
                    <strong>
                      {
                        data.requests.filter((r) => canAct(r, actor, "approve"))
                          .length
                      }{" "}
                      requests need your approval
                    </strong>{" "}
                    · {isGlobalApprover(actor) ? "All departments" : assigned}
                  </span>
                  <button
                    onClick={() => {
                      setDept(
                        isGlobalApprover(actor) ? "All departments" : assigned!,
                      );
                      setQuery("");
                      setFilter("Requested");
                    }}
                  >
                    Review requests
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
              {isInfoUser(actor) && toOrderCount > 0 && (
                <div
                  className="review-banner"
                  aria-label="Orders waiting for info"
                >
                  <ShoppingCart size={20} />
                  <span>
                    <strong>
                      {toOrderCount}{" "}
                      {toOrderCount === 1 ? "request needs" : "requests need"}{" "}
                      to be ordered
                    </strong>
                    <br />
                    Approved requests are waiting for supplier order details.
                  </span>
                  <button
                    onClick={() => {
                      setDept("All departments");
                      setQuery("");
                      go("To order");
                    }}
                  >
                    Review orders
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </>
          )}
          {page === "Ordered" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    Orders awaiting arrival{" "}
                    <span className="count-chip">{ordered.length}</span>
                  </h2>
                  <p>
                    One row per order. Only items with quantity still due are
                    shown; an order may also have items on shelf.
                  </p>
                </div>
              </div>
              <OrderedTable
                requests={ordered}
                onSelect={setSelected}
                onReceive={receiveFromOrder}
              />
            </section>
          )}
          {["Shared dashboard", "My requests", "To order", "On shelf"].includes(
            page,
          ) && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    {page === "To order"
                      ? "Approved · To order"
                      : page === "On shelf"
                        ? "Ready for pickup"
                        : page === "My requests"
                          ? "My active requests"
                          : "Shared requests & orders"}{" "}
                    <span className="count-chip">{rows.length}</span>
                  </h2>
                  <p>
                    {page === "To order"
                      ? "Everyone can view this queue. Info, the department engineer, management or admin can place the supplier order and mark it as ordered."
                      : page === "On shelf"
                        ? "Any employee can confirm collection. The name and time are recorded."
                        : "Open a request to see its next available action and full history."}
                  </p>
                </div>
                {!["On shelf", "To order"].includes(page) && (
                  <select
                    aria-label="Filter status"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    {[
                      "All active statuses",
                      "Requested",
                      "To order",
                      "Ordered",
                      "On shelf",
                      "Changes requested",
                      "Rejected",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
              {filter === "Rejected" && (
                <div className="retention-note">
                  <span>
                    {olderRejected
                      ? "Older rejected records · retained locally, outside active views"
                      : "Rejected requests remain visible for 15 days after rejection."}
                  </span>
                  <button onClick={() => setOlderRejected(!olderRejected)}>
                    {olderRejected
                      ? "Back to recent rejections"
                      : "View older rejected records"}
                  </button>
                </div>
              )}
              <RequestTable
                requests={rows}
                onSelect={setSelected}
                shelf={page === "On shelf"}
              />
            </section>
          )}
          {page === "Picked up" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    {oldCollections
                      ? "Older collection records"
                      : "Picked up in the last 30 days"}
                  </h2>
                  <p>
                    {oldCollections
                      ? "Retained for reference, with the original request and activity history."
                      : "Includes shelf pickups, direct handovers and partial collections."}
                  </p>
                </div>
                <button onClick={() => setOldCollections(!oldCollections)}>
                  {oldCollections
                    ? "Back to last 30 days"
                    : "View older records"}
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>ITEM</th>
                      <th>QUANTITY</th>
                      <th>COLLECTED BY</th>
                      <th>METHOD</th>
                      <th>RECORDED BY / WHEN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collections.map(
                      ({ request: r, item: i, collection: c }) => (
                        <tr key={c.id} onClick={() => setSelected(r.id)}>
                          <td>
                            <button
                              className="table-item"
                              onClick={() => setSelected(r.id)}
                            >
                              <strong>{i.name}</strong>
                              <small>
                                {r.id} · {r.department}
                              </small>
                            </button>
                          </td>
                          <td>
                            {c.quantity} {i.unit}
                          </td>
                          <td>{c.collector}</td>
                          <td>
                            <Badge value="Picked up" />
                            <small className="cell-note">{c.method}</small>
                          </td>
                          <td>
                            {c.by}
                            <small className="cell-note">
                              {dateTime(c.at)}
                            </small>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
                {!collections.length && (
                  <Empty
                    text={
                      oldCollections
                        ? "No older collections match your filters."
                        : "No collections in the last 30 days match your filters."
                    }
                  />
                )}
              </div>
            </section>
          )}
          {page === "Unidentified parcels" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Unmatched arrivals</h2>
                  <p>
                    Anyone can register a parcel or match it to an outstanding
                    order.
                  </p>
                </div>
                <button className="primary" onClick={() => open("parcel")}>
                  <Plus size={16} />
                  Register parcel
                </button>
              </div>
              <div className="parcel-grid">
                {parcels.map((p) => (
                  <article className="parcel-card" key={p.id}>
                    <PackageSearch size={25} />
                    <Badge value="Unidentified" />
                    <h3>{p.label}</h3>
                    <p>{p.sender}</p>
                    <div className="parcel-meta">
                      <span>
                        Shelf<strong>{p.shelf}</strong>
                      </span>
                      <span>
                        Arrived<strong>{fmt(p.at)}</strong>
                      </span>
                    </div>
                    <small>
                      Registered by {p.by} · {dateTime(p.at)}
                    </small>
                    <button onClick={() => open("match:" + p.id)}>
                      Match to an order
                      <ArrowRight size={16} />
                    </button>
                  </article>
                ))}
              </div>
              {!parcels.length && (
                <Empty text="No unmatched parcels in this view." />
              )}
            </section>
          )}
          <footer className="main-footer">
            <span>Fictional people and data · saved only in this browser</span>
            <button className="mobile-reset" onClick={() => open("reset")}>
              <RotateCcw size={14} />
              Reset demo
            </button>
            <button onClick={() => open("help")}>
              <HelpCircle size={16} />
              How it works
            </button>
          </footer>
        </main>
      </div>
      {current && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <aside
            className="detail"
            role="dialog"
            aria-modal="true"
            aria-label="Request details"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="detail-top">
              <span>
                REQUEST <b>{current.id}</b>
              </span>
              <button
                aria-label="Close details"
                onClick={() => setSelected(null)}
              >
                <X size={22} />
              </button>
            </div>
            <h2>
              {current.items[0].name}
              {current.items.length > 1
                ? ` +${current.items.length - 1} more`
                : ""}
            </h2>
            <Badge value={status(current)} />
            <div className="next-action">
              <p>
                {current.stage === "Requested" || current.stage === "Approved"
                  ? `Engineer: ${roleFor(current.department).engineers.join(", ")}. Ordering: info or the assigned engineer · ${current.department}.`
                  : status(current) === "Picked up"
                    ? "Collection complete. This record and its history are retained."
                    : "Record the next step below. Every change saves your name and the time."}
              </p>
              {actions(current)}
            </div>
            <div className="detail-people">
              {[
                ["Department", current.department],
                ["Requested by", current.requester],
                ["Recipient", current.recipient],
                ["Assigned engineers", engineers[current.department]],
                [
                  "Can place order",
                  `info, ${roleFor(current.department).engineers.join(", ")}, management or admin`,
                ],
                ["Needed date", fmt(current.needed)],
              ].map(([k, v]) => (
                <div key={k}>
                  <small>{k}</small>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            {current.stage === "Ordered" && (
              <div className="quantity-strip">
                {[
                  ["Ordered", sum(current, "quantity")],
                  ["Arrived", sum(current, "received")],
                  ["On shelf", shelfQty(current)],
                  ["Picked up", sum(current, "picked")],
                  [
                    "Still due",
                    round(sum(current, "quantity") - sum(current, "received")),
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <strong>{v}</strong>
                    <small>{k}</small>
                  </div>
                ))}
              </div>
            )}
            <h3>Items</h3>
            {current.items.map((i) => (
              <div className="detail-item" key={i.id}>
                <strong>{i.name}</strong>
                <span>
                  {i.requestedQuantity ?? i.quantity} {i.unit} requested
                  {current.stage === "Ordered"
                    ? ` · ${i.quantity} ${i.unit} ordered`
                    : ""}
                </span>
                {i.link && (
                  <a href={i.link} target="_blank" rel="noreferrer">
                    Product link
                    <ExternalLink size={13} />
                  </a>
                )}
                {current.stage === "Ordered" && (
                  <>
                    <div className="item-counts">
                      {i.received} arrived ·{" "}
                      <b>{round(i.received - i.picked)} on shelf</b> ·{" "}
                      {i.picked} picked up · {round(i.quantity - i.received)}{" "}
                      still due
                    </div>
                    {i.deliveries
                      .filter((d) => d.quantity > d.picked)
                      .map((d, n) => (
                        <p key={n} className="shelf-line">
                          <Archive size={15} />
                          <strong>{d.shelf}</strong> ·{" "}
                          {round(d.quantity - d.picked)} {i.unit} · placed by{" "}
                          {d.by}, {fmt(d.at)}
                        </p>
                      ))}
                  </>
                )}
              </div>
            ))}
            {current.items.length > 1 && (
              <p className="form-note">
                Summary quantities add the item units together. Use each item’s
                figures when units differ.
              </p>
            )}
            {current.supplier && (
              <div className="supplier-box">
                <h3>Order details</h3>
                <p>
                  {current.supplier} · {current.reference}
                </p>
                {current.orderComment && (
                  <p>Order note: {current.orderComment}</p>
                )}
                <p>
                  Ordered {fmt(current.orderedAt)} · Expected{" "}
                  {fmt(current.expected)}
                </p>
              </div>
            )}
            {current.stage === "Rejected" && (
              <div className="response-box">
                <strong>Rejection reason</strong>
                <p>
                  {current.rejectionReason ||
                    [...current.history]
                      .reverse()
                      .find((h) => h.text.startsWith("Rejected"))?.text}
                </p>
                <small>
                  Rejected {fmt(rejectionDate(current))} · kept in active views
                  for 15 days.
                </small>
              </div>
            )}
            <h3 className="timeline-title">Activity history</h3>
            <div className="timeline">
              {[...current.history].reverse().map((h, n) => (
                <div key={n}>
                  <i />
                  <strong>{h.text}</strong>
                  {h.before && (
                    <details className="audit-snapshot">
                      <summary>Previous values retained</summary>
                      <p>
                        Status: {h.before.stage} · Order:{" "}
                        {h.before.reference || "Not placed"}
                      </p>
                      {h.before.items.map((i) => (
                        <p key={i.id}>
                          {i.name}: {i.quantity} ordered, {i.received} arrived,{" "}
                          {i.picked} picked up.{" "}
                          {i.deliveries
                            .map(
                              (d) =>
                                `${d.shelf}: ${d.quantity - d.picked} remaining`,
                            )
                            .join(" · ")}
                        </p>
                      ))}
                    </details>
                  )}
                  <small>
                    {h.by} · {dateTime(h.at)}
                  </small>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal("")}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal === "request" ? "Request form" : modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>
                {modal === "correct"
                  ? "Correct status"
                  : modal === "request"
                    ? edit
                      ? "Reply to engineer"
                      : "New request"
                    : modal === "approve"
                      ? "Approve this request?"
                      : modal === "reject"
                        ? "Reject request"
                        : modal === "changes"
                          ? "Request changes"
                          : modal === "order"
                            ? "Mark as ordered"
                            : modal === "shelf"
                              ? partial
                                ? "Partial delivery"
                                : "Placed on shelf"
                              : modal === "direct"
                                ? "Handed directly to requester"
                                : modal === "pickup"
                                  ? "Picked up"
                                  : modal === "parcel"
                                    ? "Register unidentified parcel"
                                    : modal.startsWith("match:")
                                      ? "Match parcel to order"
                                      : modal === "reset"
                                        ? "Reset demo data?"
                                        : "How it works"}
              </h2>
              <button aria-label="Close form" onClick={() => setModal("")}>
                <X size={22} />
              </button>
            </div>
            {modal === "help" ? (
              <div className="help">
                <table>
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Engineers</th>
                      <th>Can place order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departmentRoles.map((r) => (
                      <tr key={r.department}>
                        <td>{r.department}</td>
                        <td>{r.engineers.join(", ")}</td>
                        <td>info or {r.engineers.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  Info ordering users:{" "}
                  {infoUsers
                    .filter((r) => r.enabled)
                    .map((r) => r.person)
                    .join(", ")}
                  . Management:{" "}
                  {managementUsers
                    .filter((r) => r.enabled)
                    .map((r) => r.person)
                    .join(", ")}
                  . Admin:{" "}
                  {adminUsers
                    .filter((r) => r.enabled)
                    .map((r) => r.person)
                    .join(", ")}
                  . Management and admin can handle decisions, ordering and
                  corrections across all departments. Admin also manages
                  configuration.
                </p>
                <p>
                  Rejected requests stay visible for 15 days. Older rejections
                  remain in the local archive view. Either department engineer,
                  management or admin can correct a status with a reason,
                  confirmation and retained previous values.
                </p>
                <p>
                  Everyone can view all requests and orders, submit a request,
                  record an arrival and confirm a pickup.
                </p>
                <ol>
                  <li>
                    <strong>Requested:</strong> an employee submits an item.
                  </li>
                  <li>
                    <strong>Approved / To order:</strong> the assigned
                    department engineer approves it. It waits for info or that
                    engineer to place the real supplier order.
                  </li>
                  <li>
                    <strong>Ordered:</strong> info or the assigned department
                    engineer places the order outside this app and records it
                    here.
                  </li>
                  <li>
                    <strong>On shelf:</strong> any employee records where the
                    arrived item was placed.
                  </li>
                  <li>
                    <strong>Picked up:</strong> any employee confirms who
                    collected it. A direct handover skips the shelf.
                  </li>
                </ol>
                <p>
                  Partial quantities are available in the arrival and pickup
                  forms. Unidentified parcels can be registered separately and
                  matched later.
                </p>
                <p>
                  Collections appear in Picked up for 30 days. View older
                  records there to look up previous collections and their
                  history. Fully collected requests are excluded from active
                  lists.
                </p>
                <p>
                  All identities and data are fictional. These local action
                  checks are not real security. Future SharePoint permissions
                  will be enforced separately. Nothing is sent to a supplier or
                  deployed.
                </p>
              </div>
            ) : (
              <form onSubmit={submit}>
                {modal === "request" && (
                  <>
                    <p className="form-note">
                      Requesting as {actor} · fictional employee
                    </p>
                    <div className="form-grid">
                      <label>
                        Department
                        <select
                          name="department"
                          defaultValue={
                            edit?.department ||
                            (dept === "All departments" ? "Automation" : dept)
                          }
                        >
                          {departments.map((d) => (
                            <option key={d}>{d}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Needed date (optional)
                        <input
                          type="date"
                          name="needed"
                          defaultValue={edit?.needed}
                        />
                      </label>
                    </div>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={forOther}
                        onChange={(e) => setForOther(e.target.checked)}
                      />
                      Ordering for someone else
                    </label>
                    {forOther ? (
                      <label>
                        Recipient
                        <select
                          name="recipient"
                          aria-label="Recipient"
                          defaultValue={edit?.recipient || actor}
                        >
                          {people.map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <p className="form-note">Recipient: {actor}</p>
                    )}
                    {edit && (
                      <div className="response-box">
                        <p>
                          {
                            [...edit.history]
                              .reverse()
                              .find((h) =>
                                h.text.startsWith("Changes requested"),
                              )?.text
                          }
                        </p>
                        <label>
                          Your reply
                          <textarea
                            name="reply"
                            required
                            placeholder="Answer the engineer and update the item if needed."
                          />
                        </label>
                      </div>
                    )}
                    {Array.from({ length: itemCount }, (_, n) => (
                      <div className="form-item" key={n}>
                        <label>
                          Item name {itemCount > 1 ? n + 1 : ""}
                          <input
                            name={`name${n}`}
                            required
                            defaultValue={edit?.items[n]?.name}
                            placeholder="What do you need?"
                          />
                        </label>
                        <div className="form-grid">
                          <label>
                            Quantity
                            <input
                              name={`quantity${n}`}
                              type="number"
                              min="0.000001"
                              step="any"
                              required
                              defaultValue={edit?.items[n]?.quantity || 1}
                            />
                          </label>
                          <label>
                            Unit
                            <select
                              name={`unit${n}`}
                              defaultValue={edit?.items[n]?.unit || "pcs"}
                            >
                              {["pcs", "m", "kg", "L", "pack", "set"].map(
                                (u) => (
                                  <option key={u}>{u}</option>
                                ),
                              )}
                            </select>
                          </label>
                        </div>
                        <label>
                          Product link (optional)
                          <input
                            name={`link${n}`}
                            type="url"
                            defaultValue={edit?.items[n]?.link}
                            placeholder="https://…"
                          />
                        </label>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setItemCount(itemCount + 1)}
                    >
                      <Plus size={15} />
                      Add another item
                    </button>
                    {itemCount > 1 && (
                      <button
                        type="button"
                        onClick={() => setItemCount(itemCount - 1)}
                      >
                        Remove last item
                      </button>
                    )}
                  </>
                )}
                {modal === "approve" && (
                  <p>
                    Approve the request for ordering. This records {actor} and
                    the current time.
                  </p>
                )}
                {["reject", "changes"].includes(modal) && (
                  <label>
                    {modal === "changes"
                      ? "What needs to change?"
                      : "Reason for rejection"}
                    <textarea name="reason" required />
                  </label>
                )}
                {modal === "order" && (
                  <>
                    <p className="form-note">
                      Record an order already placed with your supplier. This
                      app does not purchase anything.
                    </p>
                    <div className="form-grid">
                      <label>
                        Supplier
                        <input name="supplier" required />
                      </label>
                      <label>
                        Supplier order number
                        <input name="reference" required />
                      </label>
                      <label>
                        Order date
                        <input
                          type="date"
                          name="orderedAt"
                          required
                          defaultValue={new Date().toISOString().slice(0, 10)}
                        />
                      </label>
                      <label>
                        Expected delivery date
                        <input type="date" name="expected" required />
                      </label>
                    </div>
                    {current?.items.map((i) => (
                      <label key={i.id}>
                        Ordered quantity · {i.name} ({i.unit})
                        <input
                          name={"ordered-" + i.id}
                          type="number"
                          min="0.000001"
                          step="any"
                          required
                          defaultValue={i.quantity}
                        />
                        <small>
                          Originally requested:{" "}
                          {i.requestedQuantity ?? i.quantity} {i.unit}
                        </small>
                      </label>
                    ))}
                    <label>
                      Order comment (optional)
                      <textarea name="orderComment" />
                    </label>
                  </>
                )}
                {modal === "correct" && (
                  <>
                    <p>
                      Correction for {current?.id}. Your name, time, reason and
                      previous values are retained.
                    </p>
                    <label>
                      Return to status
                      <select
                        aria-label="Return to status"
                        value={correctionTarget}
                        onChange={(e) =>
                          setCorrectionTarget(
                            e.target.value as CorrectionTarget,
                          )
                        }
                      >
                        {correctionTargets.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <div className="response-box">
                      {correctionTarget === "On shelf"
                        ? "Returns all recorded arrived quantities to shelf and resets their pickups. Confirm the items are physically back."
                        : "Resets recorded arrivals and pickups. Requested / To order also clears the current order details and restores requested quantities. Previous values remain in the audit history."}
                    </div>
                    {correctionTarget === "On shelf" && (
                      <label>
                        Shelf location
                        <input name="shelf" required />
                      </label>
                    )}
                    <label>
                      Correction reason
                      <textarea name="reason" required />
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        name="confirmCorrection"
                        required
                      />
                      I confirm these changes match the actual situation.
                    </label>
                  </>
                )}
                {(["shelf", "direct", "pickup"].includes(modal) ||
                  modal.startsWith("match:")) && (
                  <>
                    {modal.startsWith("match:") && (
                      <label>
                        Order
                        <select
                          aria-label="Match order"
                          value={matchId}
                          required
                          onChange={(e) => {
                            setMatchId(e.target.value);
                            setMoveItem(
                              data.requests
                                .find((r) => r.id === e.target.value)
                                ?.items.find((i) => i.quantity > i.received)
                                ?.id || "",
                            );
                            setPartial(false);
                          }}
                        >
                          {data.requests
                            .filter((r) => canAct(r, actor, "shelf"))
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.id} · {r.items[0].name} · {r.department}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    {movementRequest && movementRequest.items.length > 1 ? (
                      <label>
                        Item
                        <select
                          aria-label="Item"
                          value={moveItem}
                          onChange={(e) => {
                            setMoveItem(e.target.value);
                          }}
                        >
                          {movementRequest.items
                            .filter((i) =>
                              modal === "pickup"
                                ? i.received > i.picked
                                : i.quantity > i.received,
                            )
                            .map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : (
                      <p>
                        <strong>
                          {movementItem?.name ||
                            "No outstanding order is available."}
                        </strong>
                      </p>
                    )}
                    <div className="movement-summary">
                      <strong>
                        {available} {movementItem?.unit}
                      </strong>
                      <span>
                        {modal === "pickup"
                          ? "currently on shelf"
                          : "still due from supplier"}
                      </span>
                    </div>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={partial}
                        onChange={(e) => setPartial(e.target.checked)}
                      />
                      Record a partial quantity
                    </label>
                    {partial && (
                      <label>
                        Quantity
                        <input
                          type="number"
                          name="quantity"
                          min="0.000001"
                          max={available}
                          step="any"
                          required
                          defaultValue={available}
                          key={moveItem}
                        />
                      </label>
                    )}
                    {modal === "shelf" && (
                      <label>
                        Shelf location
                        <input name="shelf" required placeholder="e.g. A-02" />
                      </label>
                    )}
                    {modal === "pickup" && (
                      <label>
                        Collected by
                        <input
                          name="collector"
                          required
                          defaultValue={current?.recipient}
                        />
                      </label>
                    )}
                    {modal === "direct" && (
                      <p className="handover-note">
                        Handing directly to{" "}
                        <strong>{current?.recipient}</strong>
                        {current?.recipient !== current?.requester
                          ? ` (recipient chosen by ${current?.requester})`
                          : ""}
                        . This records arrival and pickup together, without
                        adding shelf stock.
                      </p>
                    )}
                    {modal.startsWith("match:") && (
                      <p className="form-note">
                        Uses the parcel’s existing shelf location and original
                        arrival date. The quantity above is added to this order.
                      </p>
                    )}
                    <p className="form-note">
                      Recorded by {actor} · the current time will be saved.
                    </p>
                  </>
                )}
                {modal === "parcel" && (
                  <>
                    <label>
                      Parcel description
                      <input
                        name="label"
                        required
                        placeholder="Packaging or label details"
                      />
                    </label>
                    <label>
                      Sender (if known)
                      <input name="sender" />
                    </label>
                    <label>
                      Shelf location
                      <input name="shelf" required placeholder="e.g. U-01" />
                    </label>
                    <p className="form-note">
                      No department or order is required yet.
                    </p>
                  </>
                )}
                {modal === "reset" && (
                  <p>
                    This replaces your local demo changes with the fictional
                    sample requests. No real records are involved.
                  </p>
                )}
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <div className="form-footer">
                  <button type="button" onClick={() => setModal("")}>
                    Cancel
                  </button>
                  <button
                    className="primary"
                    type="submit"
                    disabled={
                      (modal.startsWith("match:") ||
                        ["shelf", "direct", "pickup"].includes(modal)) &&
                      !movementItem
                    }
                  >
                    {modal === "request"
                      ? edit
                        ? "Send reply & resubmit"
                        : "Submit request"
                      : modal === "order"
                        ? "Save order"
                        : modal === "shelf"
                          ? "Confirm shelf placement"
                          : modal === "direct"
                            ? "Confirm direct handover"
                            : modal === "pickup"
                              ? "Confirm pickup"
                              : modal === "parcel"
                                ? "Register parcel"
                                : modal.startsWith("match:")
                                  ? "Match & place on shelf"
                                  : modal === "reset"
                                    ? "Reset demo data"
                                    : "Confirm"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
