import { getAdminAccess } from "@/lib/admin/access";

interface ObservabilityEvent {
  "$metadata"?: {
    id?: string;
    message?: string;
    rayId?: string;
    service?: string;
    statusCode?: number;
    trigger?: string;
  };
  source?: unknown;
  timestamp?: number;
}

export async function GET(request: Request) {
  const { env, isAdmin } = await getAdminAccess(request.headers);
  if (!isAdmin) return Response.json({ error: "Not found" }, { status: 404 });

  const token = (env as unknown as Record<string, unknown>).RUNGSET_OBSERVABILITY_API_TOKEN;
  const accountId = env.CLOUDFLARE_D1_ACCOUNT_ID;
  if (typeof token !== "string" || !token || !accountId) {
    return Response.json({ configured: false, logs: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const now = Date.now();
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/observability/telemetry/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          queryId: "rungset-admin-recent-events",
          timeframe: { from: now - 24 * 60 * 60 * 1000, to: now },
          limit: 100,
          dry: true,
          parameters: {
            datasets: ["cloudflare-workers"],
            filterCombination: "and",
            filters: [{
              key: "$metadata.service",
              operation: "eq",
              type: "string",
              value: "rungset",
            }],
            view: "events",
          },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      console.error(JSON.stringify({ event: "admin_observability_query_failed", status: response.status }));
      return Response.json({ configured: true, error: "Cloudflare logs could not be loaded." }, { status: 502 });
    }

    const result = await response.json() as {
      result?: { events?: { count?: number; events?: ObservabilityEvent[] } };
    };
    const events = result.result?.events?.events ?? [];
    return Response.json({
      configured: true,
      count: result.result?.events?.count ?? events.length,
      logs: events.map((event, index) => ({
        id: event["$metadata"]?.id ?? `${event.timestamp ?? 0}-${index}`,
        timestamp: event.timestamp ?? null,
        message: typeof event.source === "string" ? event.source : JSON.stringify(event.source ?? ""),
        service: event["$metadata"]?.service ?? "rungset",
        statusCode: event["$metadata"]?.statusCode ?? null,
        trigger: event["$metadata"]?.trigger ?? null,
        rayId: event["$metadata"]?.rayId ?? null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error(JSON.stringify({ event: "admin_observability_query_failed", reason: "request_error" }));
    return Response.json({ configured: true, error: "Cloudflare logs could not be loaded." }, { status: 502 });
  }
}
