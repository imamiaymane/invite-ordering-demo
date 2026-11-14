import { SITE_URL } from "./config";
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export class SharePointError extends Error {
  constructor(
    message: string,
    public status: number,
    public correlationId: string | null,
  ) {
    super(message);
  }
}

function compact(value: unknown, limit: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function sharePointFailure(raw: string): {
  code?: string;
  message?: string;
  excerpt?: string;
} {
  try {
    const body = JSON.parse(raw);
    const error = body?.error ?? body?.["odata.error"];
    const code = compact(error?.code, 300);
    const message = compact(
      typeof error?.message === "string"
        ? error.message
        : error?.message?.value,
      2000,
    );
    return {
      code,
      message,
      excerpt: message ? undefined : compact(raw, 1000),
    };
  } catch {
    return { excerpt: compact(raw, 1000) };
  }
}
export function unwrap<T>(body: any): T {
  return (body?.d ?? body) as T;
}
export function pageValues<T>(body: any): T[] {
  const value = body?.value ?? body?.d?.results;
  if (!Array.isArray(value))
    throw new Error(
      "Expected SharePoint JSON collection; check authentication and endpoint.",
    );
  return value;
}
/** Same-origin cookie transport. No token storage, account impersonation or sample-user fallback. */
export class SharePointClient {
  private digest?: { value: string; expires: number };
  constructor(
    private fetcher: Fetcher = (url, init) => fetch(url, init),
    private origin: string = location.origin,
  ) {}
  url(path: string): string {
    if (this.origin !== new URL(SITE_URL).origin)
      throw new Error(
        "Run this test inside the signed-in APLPortalRedesignDEV SharePoint tab, not localhost. No cross-origin cookie workaround is used.",
      );
    const url = new URL(
      path.startsWith("http") || path.startsWith("/")
        ? path
        : `${SITE_URL}/_api/${path}`,
    );
    if (
      url.origin !== this.origin ||
      !url.pathname
        .toLowerCase()
        .startsWith(new URL(SITE_URL).pathname.toLowerCase() + "/_api/")
    )
      throw new Error(
        "Blocked endpoint outside the configured DEV site's REST API.",
      );
    return url.href;
  }
  async request(
    path: string,
    init: RequestInit = {},
  ): Promise<{ body: any; etag: string | null }> {
    const resolvedUrl = this.url(path);
    const method = (init.method ?? "GET").toUpperCase();
    const response = await this.fetcher(resolvedUrl, {
      ...init,
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      headers: { Accept: "application/json;odata=nometadata", ...init.headers },
    });
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      const detail = sharePointFailure(raw);
      const correlationId =
        response.headers.get("SPRequestGuid") ??
        response.headers.get("request-id");
      const endpoint = new URL(resolvedUrl);
      const safeEndpoint = `${endpoint.pathname}${endpoint.search}`;
      const hint =
        response.status === 401
          ? "Sign in to SharePoint."
          : response.status === 403
            ? "Access denied; check the user's actual list permissions."
            : response.status === 404
              ? "List or internal column name not found."
              : response.status === 412
                ? "Record changed; reload before retrying. No overwrite was attempted."
                : "SharePoint request failed.";
      throw new SharePointError(
        [
          `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`,
          hint,
          `Request: ${method} ${safeEndpoint}.`,
          detail.code ? `SharePoint code: ${detail.code}.` : "",
          detail.message ? `SharePoint message: ${detail.message}.` : "",
          detail.excerpt ? `Response body: ${detail.excerpt}.` : "",
          correlationId
            ? `Correlation ID: ${correlationId}.`
            : "Correlation ID: not returned.",
        ]
          .filter(Boolean)
          .join(" "),
        response.status,
        correlationId,
      );
    }
    if (response.status === 204)
      return { body: null, etag: response.headers.get("ETag") };
    if (!response.headers.get("Content-Type")?.includes("json"))
      throw new Error(
        "SharePoint returned a non-JSON page. Sign in on the target site; login HTML is not a successful connection.",
      );
    return { body: await response.json(), etag: response.headers.get("ETag") };
  }
  async get<T>(path: string): Promise<T> {
    return unwrap<T>((await this.request(path)).body);
  }
  async all<T>(path: string, maxPages = 100): Promise<T[]> {
    const rows: T[] = [];
    const seen = new Set<string>();
    let next: string | undefined = path;
    while (next) {
      if (seen.has(next) || seen.size >= maxPages)
        throw new Error(
          "Pagination limit/repeated page; results are incomplete and cannot be used for permissions.",
        );
      seen.add(next);
      const { body } = await this.request(next);
      rows.push(...pageValues<T>(body));
      next =
        body["odata.nextLink"] ?? body["@odata.nextLink"] ?? body.d?.__next;
    }
    return rows;
  }
  private async formDigest(): Promise<string> {
    if (this.digest && this.digest.expires > Date.now())
      return this.digest.value;
    const raw = unwrap<any>(
      (await this.request("contextinfo", { method: "POST" })).body,
    );
    const info = raw.GetContextWebInformation ?? raw;
    if (!info.FormDigestValue)
      throw new Error("No SharePoint form digest returned.");
    this.digest = {
      value: info.FormDigestValue,
      expires:
        Date.now() +
        Math.max(0, Number(info.FormDigestTimeoutSeconds) - 30) * 1000,
    };
    return this.digest.value;
  }
  /** Internal writer transport; diagnostic entry point never imports writer services. */
  async write(
    path: string,
    fields: Record<string, unknown>,
    etag?: string,
  ): Promise<any> {
    if (etag === "*" || (etag !== undefined && !etag))
      throw new Error(
        "A concrete ETag is required; wildcard overwrites are disabled.",
      );
    const digest = await this.formDigest();
    const { body } = await this.request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;odata=nometadata",
        "X-RequestDigest": digest,
        ...(etag ? { "X-HTTP-Method": "MERGE", "IF-MATCH": etag } : {}),
      },
      body: JSON.stringify(fields),
    });
    return unwrap(body);
  }
}
