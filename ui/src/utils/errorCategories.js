// ui/src/utils/errorCategories.js

export const ERROR_CATEGORIES = {
  network: { label: "Network", color: "#fb923c", bg: "#22253a", border: "#4c4f6e" },
  http5xx: { label: "HTTP 5xx", color: "#f87171", bg: "#2d0a0a", border: "#7f1d1d" },
  http4xx: { label: "HTTP 4xx", color: "#fbbf24", bg: "#22253a", border: "#4c4f6e" },
  resource: { label: "Resource Load", color: "#a78bfa", bg: "#1e1b4b", border: "#4c4f6e" },
  console: { label: "Console Error", color: "#60a5fa", bg: "#1e3a5f", border: "#2d4a7f" },
  timeout: { label: "Timeout", color: "#f87171", bg: "#2d0a0a", border: "#7f1d1d" },
  navigation: { label: "Navigation", color: "#94a3b8", bg: "#22253a", border: "#4c4f6e" },
  render: { label: "Render Error", color: "#f87171", bg: "#2d0a0a", border: "#7f1d1d" },
  unknown: { label: "Unknown", color: "#64748b", bg: "#1a1d27", border: "#2d3148" }
};

/**
 * Categorises an error from any source (crawler, runner, fuzzer)
 * into one of the ERROR_CATEGORIES keys.
 *
 * @param {object} opts
 * @param {string} opts.message - error message string
 * @param {string} opts.type - error type from crawler (console-error, render-error etc.)
 * @param {number} opts.statusCode - HTTP status code if available
 * @param {string} opts.anomalyType - anomaly type string from fuzzer
 */
export function categoriseError({ message = "", type = "", statusCode = null, anomalyType = "" }) {
  const msg = (message || "").toLowerCase();
  const atype = (anomalyType || "").toLowerCase();
  const etype = (type || "").toLowerCase();

  // Timeout
  if (atype.includes("timed out") || msg.includes("timed out") || msg.includes("timeout") || etype.includes("timeout")) {
    return "timeout";
  }

  // HTTP 5xx
  if (statusCode >= 500 || atype.includes("5xx") || atype.includes("500") || msg.includes("status of 500") || msg.includes("internal server error")) {
    return "http5xx";
  }

  // HTTP 4xx
  if (statusCode >= 400 || msg.includes("status of 401") || msg.includes("status of 403") || msg.includes("status of 404") || msg.includes("unauthorized") || msg.includes("forbidden")) {
    return "http4xx";
  }

  // Network
  if (msg.includes("err_name_not_resolved") || msg.includes("err_connection_refused") || msg.includes("err_connection_reset") || msg.includes("net::") || msg.includes("failed to fetch") || msg.includes("network error")) {
    return "network";
  }

  // Resource load
  if (msg.includes("failed to load resource") || msg.includes("404") || msg.includes("err_aborted") || etype.includes("resource")) {
    return "resource";
  }

  // Render error
  if (etype.includes("render-error") || msg.includes("uncaught") || msg.includes("typeerror") || msg.includes("referenceerror") || atype.includes("stack trace")) {
    return "render";
  }

  // Navigation
  if (etype.includes("navigation-error") || msg.includes("navigation") || msg.includes("goto")) {
    return "navigation";
  }

  // Console error
  if (etype.includes("console-error") || atype.includes("console")) {
    return "console";
  }

  return "unknown";
}

/**
 * Builds a category breakdown from an array of category keys.
 * Returns sorted array of { key, label, color, bg, border, count }
 */
export function buildCategoryBreakdown(categoryKeys) {
  const counts = {};
  for (const key of categoryKeys) {
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count, ...ERROR_CATEGORIES[key] }));
}