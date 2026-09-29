// ui/src/pages/SiteMap.jsx
import { useState, useEffect } from "react";
import "./SiteMap.css";
import { categoriseError, buildCategoryBreakdown, ERROR_CATEGORIES } from "../utils/errorCategories.js";

export default function SiteMap({ onGoToGenerator }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPage, setSelectedPage] = useState(null);
  const [activeTab, setActiveTab] = useState("pages");
  const [filterCategory, setFilterCategory] = useState(null);

  useEffect(() => {
    fetch("/api/sitemap")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); }
        else { setData(d); if (d.pages.length > 0) setSelectedPage(d.pages[0]); }
        setLoading(false);
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return <div className="sm-loading">Loading site map...</div>;
  if (error) return <div className="sm-error">{error}</div>;
  if (!data) return null;

  const { summary, pages } = data;
  const totalErrors = pages.reduce((n, p) => n + p.errorsObserved.length, 0);
  const totalAPICalls = pages.reduce((n, p) => n + p.networkCallsObserved.length, 0);
  const errorSummary = buildErrorSummary(pages);

  const filteredByPage = filterCategory
    ? errorSummary.byPage.map(({ url, errors }) => ({
        url,
        errors: errors.filter((e) => e.category === filterCategory)
      })).filter(({ errors }) => errors.length > 0)
    : errorSummary.byPage;

  return (
    <div className="sitemap">
      <div className="sm-summary-bar">
        <div className="sm-stat">
          <span className="sm-stat-value">{summary.pagesVisited}</span>
          <span className="sm-stat-label">Pages Visited</span>
        </div>
        <div className="sm-stat">
          <span className="sm-stat-value">{summary.inferredRoutePatterns?.length || 0}</span>
          <span className="sm-stat-label">Route Patterns</span>
        </div>
        <div className="sm-stat">
          <span className="sm-stat-value">{totalErrors}</span>
          <span className="sm-stat-label">Errors Found</span>
        </div>
        <div className="sm-stat">
          <span className="sm-stat-value">{totalAPICalls}</span>
          <span className="sm-stat-label">API Calls Observed</span>
        </div>
        <div className="sm-crawl-date">Crawled: {new Date(summary.crawlDate).toLocaleString()}</div>
      </div>

      <div className="sm-tabs">
        <button className={`sm-tab ${activeTab === "pages" ? "active" : ""}`} onClick={() => setActiveTab("pages")}>Site Map</button>
        <button className={`sm-tab ${activeTab === "errors" ? "active" : ""}`} onClick={() => setActiveTab("errors")}>
          Error Summary {totalErrors > 0 ? `(${totalErrors})` : ""}
        </button>
      </div>

      {activeTab === "pages" && (
        <div className="sm-body">
          <div className="sm-page-list">
            <div className="sm-list-title">Pages</div>
            {pages.map((p) => (
              <button
                key={p.url}
                className={`sm-page-item ${selectedPage?.url === p.url ? "active" : ""} ${p.errorsObserved.length > 0 ? "has-errors" : ""}`}
                onClick={() => setSelectedPage(p)}
              >
                <span className="sm-page-url">{p.url}</span>
                <div className="sm-page-badges">
                  {p.forms.length > 0 && <span className="badge badge-form">{p.forms.length} form</span>}
                  {p.tables.length > 0 && <span className="badge badge-table">{p.tables.length} table</span>}
                  {p.errorsObserved.length > 0 && <span className="badge badge-error">{p.errorsObserved.length} errors</span>}
                </div>
              </button>
            ))}
            {summary.inferredRoutePatterns?.length > 0 && (
              <div className="sm-patterns">
                <div className="sm-list-title" style={{ marginTop: 16 }}>Route Patterns</div>
                {summary.inferredRoutePatterns.map((p) => (
                  <div key={p} className="sm-pattern">{p}</div>
                ))}
              </div>
            )}
          </div>

          {selectedPage && (
            <div className="sm-detail">
              <h2 className="sm-detail-url">{selectedPage.url}</h2>
              {selectedPage.title && <p className="sm-detail-title">{selectedPage.title}</p>}

              {selectedPage.errorsObserved.length > 0 && (
                <Section title="Errors Observed" color="error">
                  {selectedPage.errorsObserved.map((e, i) => {
                    const cat = categoriseError({ message: e.message, type: e.type });
                    const catDef = ERROR_CATEGORIES[cat];
                    return (
                      <div key={i} className="sm-error-item">
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span className="sm-error-type">{e.type}</span>
                          <span className="sm-error-cat-badge" style={{ background: catDef.bg, color: catDef.color, border: `1px solid ${catDef.border}` }}>{catDef.label}</span>
                        </div>
                        <span className="sm-error-msg">{e.message}</span>
                        <span className="sm-error-ctx">{e.context}</span>
                      </div>
                    );
                  })}
                </Section>
              )}

              {selectedPage.forms.length > 0 && (
                <Section title="Forms">
                  {selectedPage.forms.map((form, i) => (
                    <div key={i} className="sm-form">
                      <div className="sm-form-meta">
                        {form.submitButtonText && <span className="sm-form-submit">Submit: "{form.submitButtonText}"</span>}
                        {form.action && <span className="sm-form-action">{form.method} {form.action}</span>}
                      </div>
                      <table className="sm-table">
                        <thead><tr><th>Field</th><th>Type</th><th>Required</th></tr></thead>
                        <tbody>
                          {form.fields.map((f, j) => (
                            <tr key={j}>
                              <td>{f.label || f.name}</td>
                              <td><code>{f.type}</code></td>
                              <td>{f.required ? "✓" : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </Section>
              )}

              {selectedPage.tables.length > 0 && (
                <Section title="Data Tables">
                  {selectedPage.tables.map((t, i) => (
                    <div key={i} className="sm-data-table-wrap">
                      <div className="sm-data-table-meta">{t.rowCount} rows · columns: {t.columns.join(", ")}</div>
                      {t.sampleRows?.length > 0 && (
                        <table className="sm-table">
                          <thead><tr>{t.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                          <tbody>
                            {t.sampleRows.map((row, j) => (
                              <tr key={j}>{row.map((cell, k) => <td key={k}>{cell}</td>)}</tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </Section>
              )}

              {selectedPage.buttons.length > 0 && (
                <Section title="Buttons">
                  <div className="sm-buttons">
                    {selectedPage.buttons.map((b, i) => <span key={i} className="sm-btn-chip">{b.text}</span>)}
                  </div>
                </Section>
              )}

              {selectedPage.linksTo.length > 0 && (
                <Section title="Navigates To">
                  {selectedPage.linksTo.map((l, i) => (
                    <div key={i} className="sm-link-item">
                      <span className="sm-link-trigger">"{l.trigger}"</span>
                      <span className="sm-link-arrow">→</span>
                      <span className="sm-link-target">{l.target}</span>
                    </div>
                  ))}
                </Section>
              )}

              {selectedPage.networkCallsObserved.length > 0 && (
                <Section title="API Calls Observed">
                  {selectedPage.networkCallsObserved.map((c, i) => (
                    <div key={i} className="sm-api-call">
                      <span className={`sm-method sm-method-${c.method.toLowerCase()}`}>{c.method}</span>
                      <span className="sm-endpoint">{c.url}</span>
                      <span className={`sm-status ${c.status >= 400 ? "sm-status-error" : ""}`}>{c.status}</span>
                    </div>
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "errors" && (
        <div className="sm-error-summary">
          {totalErrors === 0 && <p className="sm-empty">No errors observed during crawl.</p>}
          {totalErrors > 0 && (
            <>
              <div className="sm-error-breakdown">
                {errorSummary.categoryBreakdown.map(({ key, label, color, bg, border, count }) => (
                  <button
                    key={key}
                    className={`sm-error-breakdown-item ${filterCategory === key ? "active" : ""}`}
                    style={{ background: bg, border: `1px solid ${filterCategory === key ? color : border}`, cursor: "pointer" }}
                    onClick={() => setFilterCategory(filterCategory === key ? null : key)}
                  >
                    <span className="sm-error-type-label" style={{ color }}>{label}</span>
                    <span className="sm-error-type-count" style={{ color }}>{count}</span>
                  </button>
                ))}
              </div>
              {filterCategory && (
                <p className="sm-filter-note">Filtering by: <strong style={{ color: ERROR_CATEGORIES[filterCategory].color }}>{ERROR_CATEGORIES[filterCategory].label}</strong> — <button className="sm-filter-clear" onClick={() => setFilterCategory(null)}>clear</button></p>
              )}

              {filteredByPage.map(({ url, errors }) => (
                <div key={url} className="sm-error-page-group">
                  <div className="sm-error-page-header">
                    <span className="sm-error-page-url">{url}</span>
                    <span className="sm-error-page-count">{errors.length} error{errors.length !== 1 ? "s" : ""}</span>
                  </div>
                  {errors.map((e, i) => {
                    const catDef = ERROR_CATEGORIES[e.category];
                    return (
                      <div key={i} className="sm-error-item sm-error-item-summary">
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span className="sm-error-type">{e.type}</span>
                          <span className="sm-error-cat-badge" style={{ background: catDef.bg, color: catDef.color, border: `1px solid ${catDef.border}` }}>{catDef.label}</span>
                        </div>
                        <span className="sm-error-msg">{e.message}</span>
                      </div>
                    );
                  })}
                </div>
              ))}

              {errorSummary.topMessages.length > 0 && (
                <div className="sm-error-top">
                  <div className="sm-list-title" style={{ marginBottom: 8 }}>Most Common Errors</div>
                  {errorSummary.topMessages.map(({ message, count, pages, category }) => {
                    const catDef = ERROR_CATEGORIES[category];
                    return (
                      <div key={message} className="sm-error-common">
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <span className="sm-error-cat-badge" style={{ background: catDef.bg, color: catDef.color, border: `1px solid ${catDef.border}` }}>{catDef.label}</span>
                        </div>
                        <div className="sm-error-common-msg">{message}</div>
                        <div className="sm-error-common-meta">{count}× across {pages.length} page{pages.length !== 1 ? "s" : ""}: {pages.join(", ")}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="sm-footer">
        <button className="sm-gen-btn" onClick={onGoToGenerator}>Generate Tests from this Site Map</button>
      </div>
    </div>
  );
}

function buildErrorSummary(pages) {
  const byPage = [];
  const messageCounts = {};
  const allCategories = [];

  for (const page of pages) {
    if (page.errorsObserved.length === 0) continue;
    const errorsWithCategory = page.errorsObserved.map((e) => ({
      ...e,
      category: categoriseError({ message: e.message, type: e.type })
    }));
    byPage.push({ url: page.url, errors: errorsWithCategory });

    for (const e of errorsWithCategory) {
      allCategories.push(e.category);
      const msgKey = e.message?.slice(0, 120) || "(no message)";
      if (!messageCounts[msgKey]) messageCounts[msgKey] = { count: 0, pages: [], category: e.category };
      messageCounts[msgKey].count++;
      if (!messageCounts[msgKey].pages.includes(page.url)) messageCounts[msgKey].pages.push(page.url);
    }
  }

  const categoryBreakdown = buildCategoryBreakdown(allCategories);
  const topMessages = Object.entries(messageCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([message, { count, pages, category }]) => ({ message, count, pages, category }));

  return { byPage, categoryBreakdown, topMessages };
}

function Section({ title, children, color }) {
  return (
    <div className={`sm-section ${color ? `sm-section-${color}` : ""}`}>
      <div className="sm-section-title">{title}</div>
      {children}
    </div>
  );
}