import { readFileSync } from "node:fs";

const API_BASE_URL = "https://api.cloudflare.com/client/v4";
const ZONE_NAME = "rungset.com";
const HOSTS = ["app.rungset.com"];

const PAGE_PATHS = [
  "/",
  "/admin",
  "/analytics",
  "/auth/signin",
  "/auth/signup",
  "/auth/verify-email",
  "/calendar",
  "/checkins",
  "/dashboard",
  "/docs",
  "/goals",
  "/milestones",
  "/notes",
  "/settings",
  "/todos",
];

const PUBLIC_ASSET_PATHS = [
  "/favicon.ico",
  "/manifest.json",
  "/robots.txt",
  "/splash.svg",
  "/sw.js",
];

const DATA_API_PATHS = [
  "/api/admin/email",
  "/api/admin/logs",
  "/api/admin/overview",
  "/api/admin/users",
  "/api/checkins",
  "/api/goals",
  "/api/milestones",
  "/api/notes",
  "/api/todos",
  "/api/export",
  "/api/todo-occurrences",
];

const DATA_API_PREFIXES = [
  "/api/checkins/",
  "/api/goals/",
  "/api/milestones/",
  "/api/notes/",
  "/api/todos/",
];

const ALLOWED_METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"];
const ALLOWED_PREFIXES = [
  "/_next/",
  "/api/auth/",
  "/cdn-cgi/",
  "/images/",
  "/.well-known/",
];

const quoteSet = (values) => `{${values.map(JSON.stringify).join(" ")}}`;

const withOptionalTrailingSlash = (paths) =>
  paths.flatMap((path) => (path === "/" ? [path] : [path, `${path}/`]));

const hostnameExpression = `http.host in ${quoteSet(HOSTS)}`;
const knownPathExpression = [
  `lower(http.request.uri.path) in ${quoteSet([
    ...withOptionalTrailingSlash(PAGE_PATHS),
    ...PUBLIC_ASSET_PATHS,
    ...withOptionalTrailingSlash(DATA_API_PATHS),
    "/api/auth",
  ])}`,
  ...DATA_API_PREFIXES.map(
    (prefix) =>
      `starts_with(lower(http.request.uri.path), ${JSON.stringify(prefix)})`,
  ),
  'starts_with(lower(http.request.uri.path), "/goals/")',
  ...ALLOWED_PREFIXES.map(
    (prefix) =>
      `starts_with(lower(http.request.uri.path), ${JSON.stringify(prefix)})`,
  ),
].join(" or ");

const dataApiExpression = `(${[
  `lower(http.request.uri.path) in ${quoteSet(
    withOptionalTrailingSlash(DATA_API_PATHS),
  )}`,
  ...DATA_API_PREFIXES.map(
    (prefix) =>
      `starts_with(lower(http.request.uri.path), ${JSON.stringify(prefix)})`,
  ),
].join(" or ")})`;

const hasSessionCookieExpression = [
  'http.cookie contains "__Secure-better-auth.session_token="',
  'http.cookie contains "better-auth.session_token="',
].join(" or ");

const customRules = [
  {
    description: "Rungset - block traffic outside application surface",
    expression: `(${hostnameExpression} and (not http.request.method in ${quoteSet(
      ALLOWED_METHODS,
    )} or not (${knownPathExpression}) or (${dataApiExpression} and not (${hasSessionCookieExpression}))))`,
    action: "block",
    enabled: true,
  },
  {
    description: "Rungset - challenge suspicious automated clients",
    expression: `(${hostnameExpression} and not cf.client.bot and (len(http.user_agent) eq 0 or lower(http.user_agent) contains "curl/" or lower(http.user_agent) contains "wget/" or lower(http.user_agent) contains "python-requests" or lower(http.user_agent) contains "go-http-client" or lower(http.user_agent) contains "sqlmap" or lower(http.user_agent) contains "nikto" or lower(http.user_agent) contains "masscan" or lower(http.user_agent) contains "zgrab" or lower(http.user_agent) contains "gobuster" or lower(http.user_agent) contains "ffuf" or lower(http.user_agent) contains "wpscan"))`,
    action: "managed_challenge",
    enabled: true,
  },
];

const rateLimitRules = [
  {
    description: "Rungset - rate limit authentication writes",
    expression:
      '(lower(http.request.uri.path) in {"/api/auth/sign-in/email" "/api/auth/sign-in/social" "/api/auth/sign-up/email"})',
    action: "block",
    ratelimit: {
      characteristics: ["cf.colo.id", "ip.src"],
      period: 10,
      requests_per_period: 5,
      mitigation_timeout: 10,
    },
    enabled: true,
  },
];

const tokenFile = process.env.CLOUDFLARE_API_TOKEN_FILE?.trim();
const tokenFromFile = tokenFile
  ? readFileSync(tokenFile, "utf8").trim()
  : undefined;
const token =
  process.env.CLOUDFLARE_API_TOKEN?.trim() ||
  process.env.CF_API_TOKEN?.trim() ||
  tokenFromFile;
const dryRun = process.argv.includes("--dry-run");

function printPlan() {
  for (const rule of [...customRules, ...rateLimitRules]) {
    console.log(`\n${rule.description}`);
    console.log(`Action: ${rule.action}`);
    console.log(`Expression: ${rule.expression}`);
  }
}

async function cloudflareRequest(path, options = {}, allowNotFound = false) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (allowNotFound && response.status === 404) {
    return null;
  }

  const payload = await response.json();
  if (!response.ok || !payload.success) {
    const messages = (payload.errors ?? [])
      .map((error) => error.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `Cloudflare API request failed (${response.status}): ${messages || "Unknown error"}`,
    );
  }

  return payload.result;
}

async function getZoneId() {
  const zones = await cloudflareRequest(
    `/zones?name=${encodeURIComponent(ZONE_NAME)}`,
  );
  const zone = zones.find((candidate) => candidate.name === ZONE_NAME);

  if (!zone) {
    throw new Error(`Cloudflare zone ${ZONE_NAME} was not found.`);
  }

  return zone.id;
}

async function upsertRules(zoneId, phase, rulesetName, rules) {
  let ruleset = await cloudflareRequest(
    `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`,
    {},
    true,
  );

  if (!ruleset) {
    ruleset = await cloudflareRequest(`/zones/${zoneId}/rulesets`, {
      method: "POST",
      body: JSON.stringify({
        name: rulesetName,
        kind: "zone",
        phase,
        rules,
      }),
    });
    console.log(`Created ${rulesetName} with ${rules.length} rule(s).`);
    return;
  }

  for (const rule of rules) {
    const existingRule = ruleset.rules?.find(
      (candidate) => candidate.description === rule.description,
    );

    if (existingRule) {
      await cloudflareRequest(
        `/zones/${zoneId}/rulesets/${ruleset.id}/rules/${existingRule.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(rule),
        },
      );
      console.log(`Updated: ${rule.description}`);
    } else {
      await cloudflareRequest(
        `/zones/${zoneId}/rulesets/${ruleset.id}/rules`,
        {
          method: "POST",
          body: JSON.stringify(rule),
        },
      );
      console.log(`Created: ${rule.description}`);
    }
  }
}

async function main() {
  if (dryRun) {
    printPlan();
    return;
  }

  if (!token) {
    throw new Error(
      "Set CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_TOKEN_FILE to a token with Zone Read and Zone WAF Edit permissions.",
    );
  }

  const zoneId = await getZoneId();
  await upsertRules(
    zoneId,
    "http_request_firewall_custom",
    "Rungset application traffic protection",
    customRules,
  );
  await upsertRules(
    zoneId,
    "http_ratelimit",
    "Rungset authentication rate limits",
    rateLimitRules,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
