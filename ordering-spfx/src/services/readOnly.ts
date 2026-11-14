import { SPHttpClient } from "@microsoft/sp-http";
import type { WebPartContext } from "@microsoft/sp-webpart-base";
import { SharePointClient } from "./adapter/client";
import { SharePointRepository } from "./adapter/repository";
import { SITE_URL, type User } from "./adapter/config";

export function assertReadOnlyMethod(method = "GET"): void {
  if (method.toUpperCase() !== "GET")
    throw new Error("Read-only SPFx build: SharePoint writes are disabled.");
}
/** Only unwrap the known SharePoint Online membership-user claim prefix.
 * Do not equate arbitrary claim providers, display names, or email aliases. */
export function normalizeUserLogin(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^i:0#\.f\|membership\|/, "");
}
export function createSharePointRepository(
  context: WebPartContext,
  permitControlledWrites = false,
): SharePointRepository {
  const normalize = (value: string): string =>
    value.replace(/\/$/, "").toLowerCase();
  if (normalize(context.pageContext.web.absoluteUrl) !== normalize(SITE_URL)) {
    throw new Error(
      `Open this web part in ${SITE_URL}. Other sites are blocked in this test build.`,
    );
  }
  const loginName = context.pageContext.user.loginName;
  if (!loginName)
    throw new Error(
      "WebPartContext does not contain a signed-in SharePoint user.",
    );
  const client = new SharePointClient(async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    if (!permitControlledWrites) assertReadOnlyMethod(method);
    else if (!["GET", "POST"].includes(method))
      throw new Error("New-request test mode permits only SharePoint GET and POST requests.");
    const headers = new Headers(init.headers);
    // SPHttpClient's jsonRequest mode requires an explicit supported OData version
    // for contextinfo, creates and MERGE-over-POST updates.
    headers.set("OData-Version", method === "GET" ? "" : "3.0");
    const response = permitControlledWrites
      ? await context.spHttpClient.fetch(
          url,
          SPHttpClient.configurations.v1,
          { ...init, headers },
        )
      : await context.spHttpClient.get(
          url,
          SPHttpClient.configurations.v1,
          { headers },
        );
    const responseText = await response.text();
    // Native Response rejects a body (including an empty string) for these
    // statuses. SharePoint MERGE-over-POST normally returns 204 No Content.
    const nullBodyStatus = [204, 205, 304].includes(response.status);
    return new Response(nullBodyStatus ? null : responseText, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }, new URL(context.pageContext.web.absoluteUrl).origin);
  class ContextRepository extends SharePointRepository {
    public async currentUser(): Promise<User> {
      const resolved = await super.currentUser();
      if (
        normalizeUserLogin(resolved.LoginName) !== normalizeUserLogin(loginName)
      )
        throw new Error(
          `SharePoint REST identity differs from WebPartContext after membership-claim normalization. Context login: ${loginName}; REST login: ${resolved.LoginName}; REST site user ID: ${resolved.Id}. Reload the Workbench. If the logins still identify different accounts, sign out/in with the intended account. Writes remain disabled.`,
        );
      return {
        ...resolved,
        Title: context.pageContext.user.displayName,
        Email: context.pageContext.user.email || resolved.Email,
      };
    }
  }
  // Only the compile-time web-part flag can enable the narrow new-request test.
  // There is no property-pane or query-string switch.
  return new ContextRepository(client, permitControlledWrites);
}

export function createReadOnlyRepository(
  context: WebPartContext,
): SharePointRepository {
  return createSharePointRepository(context, false);
}
