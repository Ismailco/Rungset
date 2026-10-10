export const WORKER_LOG_PAGE_SIZE = 50;

const LOG_RANGES = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
} as const;

const LOG_LEVELS = ["debug", "info", "log", "warn", "error"] as const;

export type WorkerLogRange = keyof typeof LOG_RANGES;
export type WorkerLogLevel = (typeof LOG_LEVELS)[number];

export interface WorkerLogFilters {
  range: WorkerLogRange;
  level: WorkerLogLevel | "all";
  search: string;
  cursor: string | null;
  timeframeEnd: number | null;
}

export function parseWorkerLogFilters(params: URLSearchParams, now = Date.now()): WorkerLogFilters | null {
  const range = params.get("range") ?? "7d";
  const level = params.get("level") ?? "all";
  const search = (params.get("search") ?? "").trim();
  const cursor = params.get("cursor")?.trim() || null;
  const timeframeEndValue = params.get("timeframeEnd");
  const timeframeEnd = timeframeEndValue === null ? null : Number(timeframeEndValue);

  if (!Object.hasOwn(LOG_RANGES, range)) return null;
  if (level !== "all" && !LOG_LEVELS.includes(level as WorkerLogLevel)) return null;
  if (search.length > 100 || (cursor && cursor.length > 256)) return null;
  if (cursor && timeframeEnd === null) return null;
  if (
    timeframeEnd !== null &&
    (!cursor || !Number.isSafeInteger(timeframeEnd) || timeframeEnd <= 0 || timeframeEnd > now)
  ) return null;

  return {
    range: range as WorkerLogRange,
    level: level as WorkerLogLevel | "all",
    search,
    cursor,
    timeframeEnd,
  };
}

export function createWorkerLogQuery(filters: WorkerLogFilters, now: number) {
  const timeframeEnd = filters.timeframeEnd ?? now;
  const filtersForQuery = [
    {
      key: "$metadata.service",
      operation: "eq",
      type: "string",
      value: "rungset",
    },
  ];

  if (filters.level !== "all") {
    filtersForQuery.push({
      key: "$metadata.level",
      operation: "eq",
      type: "string",
      value: filters.level,
    });
  }

  return {
    queryId: "rungset-admin-events",
    timeframe: { from: timeframeEnd - LOG_RANGES[filters.range], to: timeframeEnd },
    limit: WORKER_LOG_PAGE_SIZE,
    dry: true,
    view: "events",
    ...(filters.cursor ? { offset: filters.cursor, offsetDirection: "next" } : {}),
    ...(filters.search ? {
      needle: { value: filters.search, isRegex: false, matchCase: false },
    } : {}),
    parameters: {
      datasets: ["cloudflare-workers"],
      filterCombination: "and",
      filters: filtersForQuery,
    },
  };
}
