import { SharePointClient } from "./client";
import { SharePointRepository, message } from "./repository";
import { SITE_URL, departments } from "./config";

// Independently blocks every non-GET request, even if a writer were accidentally called.
const getOnly = (url: string, init?: RequestInit) => {
  if ((init?.method ?? "GET").toUpperCase() !== "GET")
    throw new Error("Read-only diagnostic blocked a write.");
  return fetch(url, init);
};
async function run() {
  if (
    location.origin !== new URL(SITE_URL).origin ||
    !(
      location.pathname.toLowerCase() ===
        new URL(SITE_URL).pathname.toLowerCase() ||
      location.pathname
        .toLowerCase()
        .startsWith(new URL(SITE_URL).pathname.toLowerCase() + "/")
    )
  ) {
    throw new Error(
      `Open ${SITE_URL}/SitePages/Home.aspx in your signed-in browser, then run this diagnostic there.`,
    );
  }
  document.getElementById("invite-readonly-probe")?.remove();
  const host = document.createElement("div");
  host.id = "invite-readonly-probe";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent =
    ":host{position:fixed;inset:25px;z-index:2147483647;background:white;color:#17253a;border:3px solid #a92b48;border-radius:12px;box-shadow:0 4px 30px #555;font:16px/1.5 system-ui;overflow:auto;padding:24px}button{font:inherit;padding:8px 18px;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}h2{margin-top:0}";
  shadow.append(style);
  const close = document.createElement("button");
  close.textContent = "Close";
  close.onclick = () => host.remove();
  shadow.append(close);
  const heading = document.createElement("h2");
  heading.textContent = "INVITE — SharePoint read-only test";
  shadow.append(heading);
  const output = document.createElement("pre");
  output.textContent =
    "Checking current user and nine lists. GET requests only. No records will be created.";
  shadow.append(output);
  document.body.append(host);
  try {
    const report = await new SharePointRepository(
      new SharePointClient(getOnly),
    ).probe();
    const user = report.user,
      roles = report.roles;
    const summary = [
      report.passed
        ? "PASS — current user, list reads, schema and roles verified."
        : "FAIL — connection/schema/role checks need attention.",
      "Writes remain DISABLED. This result does not enable order/request writes.",
      `Checked: ${report.checkedAt}`,
      `Site: ${SITE_URL}`,
      user
        ? `Signed in: ${user.Title} (site user ID ${user.Id})`
        : "Current user: unavailable",
      "",
      ...report.lists.map(
        (l) =>
          `${l.readable && l.schemaValid ? "PASS" : "FAIL"} ${l.list}${l.errors.length ? "\n  " + l.errors.join("\n  ") : ""}`,
      ),
      "",
      ...report.errors,
      ...report.warnings.map((w) => `NOTE: ${w}`),
    ];
    if (user && roles)
      summary.push(
        "",
        "Your resolved roles (memberships combine):",
        `Engineer: ${departments.filter((d) => roles.departmentEngineers[d].includes(user.Id)).join(", ") || "none"}`,
        `Info ordering: ${roles.info.includes(user.Id)}`,
        `Management: ${roles.management.includes(user.Id)}`,
        `Admin: ${roles.admins.includes(user.Id)}`,
        "Legacy Engineer column was not used. Display names and the local info alias do not grant permissions.",
      );
    output.textContent = summary.join("\n");
    const copy = document.createElement("button");
    copy.textContent = "Copy test summary";
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(output.textContent ?? "");
        copy.textContent = "Copied";
      } catch {
        copy.textContent = "Select and copy the summary manually";
      }
    };
    shadow.append(copy);
  } catch (e) {
    output.textContent = `FAIL: ${message(e)}\nNo writes performed.`;
  }
}
void run().catch((e) => console.error(message(e)));
