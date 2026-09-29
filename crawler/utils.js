// crawler/utils.js

/**
 * Returns true if `url` is on the same origin as `baseURL`.
 * Used to avoid crawling external links (GitHub, social media, etc.)
 */
export function isSameOrigin(url, baseURL) {
  try {
    const target = new URL(url, baseURL);
    const base = new URL(baseURL);
    return target.origin === base.origin;
  } catch {
    return false;
  }
}

/**
 * Normalizes a URL to just its path + search params, dropping origin,
 * hash fragments, and trailing slashes (except root).
 * e.g. "http://localhost:3000/clients/?foo=bar#section" -> "/clients?foo=bar"
 */
export function normalizePath(url, baseURL) {
  const u = new URL(url, baseURL);

  // Hash-based routing - the route lives after "#", e.g. "#/clients"
  if (u.hash && u.hash.startsWith("#/")) {
    let hashPath = u.hash.slice(1); // drop the "#", keep leading "/"
    if (hashPath.length > 1 && hashPath.endsWith("/")) {
      hashPath = hashPath.slice(0, -1);
    }
    return hashPath;
  }

  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return path + (u.search || "");
}

/**
 * Returns true if a link should be skipped entirely
 * (mailto, tel, javascript:, anchors-only).
 */
export function isSkippableLink(href) {
  if (!href) return true;
  const trimmed = href.trim().toLowerCase();

  if (["mailto:", "tel:", "javascript:"].some((p) => trimmed.startsWith(p))) {
    return true;
  }

  // "#/clients" is a hash-route (real page) - keep it.
  // "#section" or bare "#" is a same-page anchor - skip it.
  if (trimmed.startsWith("#") && !trimmed.startsWith("#/")) return true;

  return false;
}

/**
 * Given a list of visited paths, infers route parameter patterns.
 * e.g. ["/clients/1", "/clients/2", "/clients/3"] -> "/clients/:id"
 *
 * Strategy: group paths by segment count, compare segment-by-segment,
 * if a segment varies across multiple paths AND looks like an ID
 * (numeric, or UUID-like), replace it with :param.
 */
export function inferRouteParams(paths) {
  // Group last-segment values by their "prefix" (everything before the last segment).
  // e.g. "/clients/1" and "/clients/new" both have prefix "/clients",
  // with last segments "1" and "new" respectively.
  const prefixGroups = {};
  const patterns = new Set();

  for (const path of paths) {
    const segments = path.split("?")[0].split("/").filter(Boolean);

    if (segments.length === 0) {
      patterns.add("/");
      continue;
    }

    const prefix = "/" + segments.slice(0, -1).join("/");
    const last = segments[segments.length - 1];

    if (!prefixGroups[prefix]) prefixGroups[prefix] = [];
    prefixGroups[prefix].push(last);
  }

  for (const [prefix, lastSegments] of Object.entries(prefixGroups)) {
    const base = prefix === "/" ? "" : prefix;

    const idLike = lastSegments.filter((s) => looksLikeId(new Set([s])));
    const nonIdLike = new Set(
      lastSegments.filter((s) => !looksLikeId(new Set([s])))
    );

    // If any sibling under this prefix looks like an ID, treat the
    // position as a route parameter.
    if (idLike.length > 0) {
      patterns.add(`${base}/:id`);
    }

    // Non-ID-looking siblings (e.g. "new", "edit") are real static pages,
    // keep them as their own patterns.
    for (const seg of nonIdLike) {
      patterns.add(`${base}/${seg}`);
    }
  }

  return [...patterns];
}

/**
 * Checks if a set of string values all look like IDs
 * (numeric, or UUID format).
 */
function looksLikeId(values) {
  const numericPattern = /^\d+$/;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return [...values].every(
    (v) => numericPattern.test(v) || uuidPattern.test(v)
  );
}

/**
 * Truncates a string/object for safe storage in raw JSON output.
 * Prevents huge response bodies from bloating files.
 */
export function truncate(value, maxLength = 500) {
  let str;
  try {
    str = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
  if (str.length <= maxLength) return value;
  return str.slice(0, maxLength) + `... [truncated, ${str.length} chars total]`;
}
