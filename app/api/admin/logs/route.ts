import { getAdminAccess } from "@/lib/admin/access";
import {
  createWorkerLogQuery,
  parseWorkerLogFilters,
  WORKER_LOG_PAGE_SIZE,
} from "@/lib/admin/observability-query";

interface ObservabilityEvent {
  "$metadata"?: {
    id?: string;
    message?: string;
    rayId?: string;
    requestId?: string;
    service?: string;
    statusCode?: number;
    trigger?: string;
    level?: string;
    error?: string;
    [key: string]: unknown;
  };
  source?: unknown;
  timestamp?: number;
  [key: string]: unknown;
}

export async function GET(request: Request) {
  const { env, isAdmin } = await getAdminAccess(request.headers);
  if (!isAdmin) return Response.json({ error: "Not found" }, { status: 404 });

  const filters = parseWorkerLogFilters(new URL(request.url).searchParams);
  if (!filters) return Response.json({ error: "Invalid log filters." }, { status: 400 });

  const token = (env as unknown as Record<string, unknown>).RUNGSET_OBSERVABILITY_API_TOKEN;
  const accountId = env.CLOUDFLARE_D1_ACCOUNT_ID;
  if (typeof token !== "string" || !token || !accountId) {
    return Response.json({ configured: false, logs: [], count: 0, nextCursor: null }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/observability/telemetry/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createWorkerLogQuery(filters, Date.now())),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      console.error(JSON.stringify({ event: "admin_observability_query_failed", status: response.status }));
      return Response.json({ configured: true, error: "Cloudflare logs could not be loaded." }, { status: 502 });
    }

    const result = await response.json() as {
      success?: boolean;
      result?: { events?: { count?: number; events?: ObservabilityEvent[] } };
    };
    if (result.success === false) {
      console.error(JSON.stringify({ event: "admin_observability_query_failed", reason: "provider_error" }));
      return Response.json({ configured: true, error: "Cloudflare logs could not be loaded." }, { status: 502 });
    }

    const events = result.result?.events?.events ?? [];
    const lastId = events.at(-1)?.["$metadata"]?.id;
    const logs = events.map((event, index) => {
      const metadata = event["$metadata"] ?? {};
      const message = metadata.message ?? metadata.error ?? formatLogSource(event.source);

      return {
        id: metadata.id ?? `${event.timestamp ?? 0}-${index}`,
        timestamp: event.timestamp ?? null,
        level: typeof metadata.level === "string" ? metadata.level : null,
        message,
        service: metadata.service ?? "rungset",
        statusCode: typeof metadata.statusCode === "number" ? metadata.statusCode : null,
        trigger: typeof metadata.trigger === "string" ? metadata.trigger : null,
        rayId: typeof metadata.rayId === "string" ? metadata.rayId : null,
        requestId: typeof metadata.requestId === "string" ? metadata.requestId : null,
        dataset: typeof event.dataset === "string" ? event.dataset : null,
        event: {
          ...event,
          "$metadata": { ...metadata, account: undefined },
        },
      };
    });

    return Response.json({
      configured: true,
      count: result.result?.events?.count ?? events.length,
      logs,
      nextCursor: events.length === WORKER_LOG_PAGE_SIZE && lastId ? lastId : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error(JSON.stringify({ event: "admin_observability_query_failed", reason: "request_error" }));
    return Response.json({ configured: true, error: "Cloudflare logs could not be loaded." }, { status: 502 });
  }
}

function formatLogSource(source: unknown): string {
  if (typeof source === "string") return source;
  if (source === undefined || source === null) return "";

  try {
    return JSON.stringify(source) ?? "";
  } catch {
    return "Unable to display this log message.";
  }
}
