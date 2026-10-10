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
}

export function parseWorkerLogFilters(params: URLSearchParams): WorkerLogFilters | null {
  const range = params.get("range") ?? "7d";
  const level = params.get("level") ?? "all";
  const search = (params.get("search") ?? "").trim();
  const cursor = params.get("cursor")?.trim() || null;

  if (!Object.hasOwn(LOG_RANGES, range)) return null;
  if (level !== "all" && !LOG_LEVELS.includes(level as WorkerLogLevel)) return null;
  if (search.length > 100 || (cursor && cursor.length > 256)) return null;

  return {
    range: range as WorkerLogRange,
    level: level as WorkerLogLevel | "all",
    search,
    cursor,
  };
}

export function createWorkerLogQuery(filters: WorkerLogFilters, now: number) {
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
    timeframe: { from: now - LOG_RANGES[filters.range], to: now },
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
