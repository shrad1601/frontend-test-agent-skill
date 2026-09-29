// ui/src/pages/Runner.jsx
import { useState, useRef, useEffect } from "react";
import "./Runner.css";
import { categoriseError, buildCategoryBreakdown, ERROR_CATEGORIES } from "../utils/errorCategories.js";

export default function Runner() {
  const [runStatus, setRunStatus] = useState("idle");
  const [runLogs, setRunLogs] = useState([]);
  const [reportStatus, setReportStatus] = useState("idle");
  const [results, setResults] = useState(null);
  const [activeSection, setActiveSection] = useState("hard");
  const [improveStatus, setImproveStatus] = useState("idle");
  const [improveLogs, setImproveLogs] = useState([]);
  const [improvedResults, setImprovedResults] = useState(null);
  const [improvedReportStatus, setImprovedReportStatus] = useState("idle");
  const logsEndRef = useRef(null);
  const improveLogsEndRef = useRef(null);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [runLogs]);
  useEffect(() => { improveLogsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [improveLogs]);

  useEffect(() => {
    fetch("/api/report/results")
      .then((r) => r.json())
      .then((d) => {
        if (d.results) { setResults(d); setRunStatus("done"); if (d.report) setReportStatus("done"); }
      })
      .catch(() => {});

    fetch("/api/improve-tests/results")
      .then((r) => r.json())
      .then((d) => {
        if (d.meta) {
          setImprovedResults(d);
          if (d.report) setImprovedReportStatus("done");
        }
      })
      .catch(() => {});
  }, []);

  async function startTests() {
    setRunStatus("running");
    setRunLogs([]);
    setResults(null);
    setReportStatus("idle");
    try {
      const res = await fetch("/api/run-tests", { method: "POST" });
      if (!res.ok) { const err = await res.json(); setRunStatus("error"); setRunLogs([`Error: ${err.error}`]); return; }
    } catch (err) { setRunStatus("error"); setRunLogs([`Failed to reach backend: ${err.message}`]); return; }

    const es = new EventSource("/api/run-tests/stream");
    es.onmessage = (e) => { const { line } = JSON.parse(e.data); setRunLogs((prev) => [...prev, line]); };
    es.addEventListener("done", async (e) => {
      const { status: finalStatus } = JSON.parse(e.data);
      setRunStatus(finalStatus);
      es.close();
      if (finalStatus === "done") { const d = await fetch("/api/report/results").then((r) => r.json()); setResults(d); }
    });
    es.onerror = () => es.close();
  }

  async function generateReport() {
    setReportStatus("running");
    try {
      const res = await fetch("/api/report", { method: "POST" });
      const d = await res.json();
      if (d.error) { setReportStatus("error"); return; }
      const updated = await fetch("/api/report/results").then((r) => r.json());
      setResults(updated);
      setReportStatus("done");
    } catch { setReportStatus("error"); }
  }

  async function startImprove() {
    setImproveStatus("running");
    setImproveLogs([]);
    setImprovedResults(null);
    setImprovedReportStatus("idle");
    try {
      const res = await fetch("/api/improve-tests", { method: "POST" });
      if (!res.ok) { const err = await res.json(); setImproveStatus("error"); setImproveLogs([`Error: ${err.error}`]); return; }
    } catch (err) { setImproveStatus("error"); setImproveLogs([`Failed to reach backend: ${err.message}`]); return; }

    const es = new EventSource("/api/improve-tests/stream");
    es.onmessage = (e) => { const { line } = JSON.parse(e.data); setImproveLogs((prev) => [...prev, line]); };
    es.addEventListener("done", async (e) => {
      const { status: finalStatus } = JSON.parse(e.data);
      setImproveStatus(finalStatus);
      es.close();
      if (finalStatus === "done") {
        const d = await fetch("/api/improve-tests/results").then((r) => r.json());
        if (d.meta) setImprovedResults(d);
      }
    });
    es.onerror = () => es.close();
  }

  async function runImprovedTests() {
    setRunStatus("running");
    setRunLogs([]);
    setImprovedReportStatus("idle");
    try {
      const res = await fetch("/api/run-improved", { method: "POST" });
      if (!res.ok) { const err = await res.json(); setRunStatus("error"); setRunLogs([`Error: ${err.error}`]); return; }
    } catch (err) { setRunStatus("error"); setRunLogs([`Failed to reach backend: ${err.message}`]); return; }

    const es = new EventSource("/api/run-tests/stream");
    es.onmessage = (e) => { const { line } = JSON.parse(e.data); setRunLogs((prev) => [...prev, line]); };
    es.addEventListener("done", async (e) => {
      const { status: finalStatus } = JSON.parse(e.data);
      setRunStatus(finalStatus);
      es.close();
      if (finalStatus === "done") {
        const d = await fetch("/api/improve-tests/results").then((r) => r.json());
        if (d.meta) {
          setImprovedResults(d);
          if (d.report) setImprovedReportStatus("done");
        }
        setActiveSection("improved");
      }
    });
    es.onerror = () => es.close();
  }

  async function generateImprovedReport() {
    setImprovedReportStatus("running");
    try {
      const res = await fetch("/api/improved-report", { method: "POST" });
      const d = await res.json();
      if (d.error) { setImprovedReportStatus("error"); return; }
      const updated = await fetch("/api/improve-tests/results").then((r) => r.json());
      if (updated.meta) setImprovedResults(updated);
      setImprovedReportStatus("done");
    } catch { setImprovedReportStatus("error"); }
  }

  const summary = results?.results ? {
    total: results.results.length,
    passed: results.results.filter((r) => r.status === "passed").length,
    failed: results.results.filter((r) => r.status === "failed").length,
    errored: results.results.filter((r) => r.status === "error").length,
    hardErrors: results.results.filter((r) => r.status === "error" || r.networkErrors?.some((e) => e.status >= 500))
  } : null;

  const errorCategories = results?.results ? buildCategoryBreakdown(
    results.results.flatMap((r) => {
      const cats = [];
      if (r.errorMessage) cats.push(categoriseError({ message: r.errorMessage, anomalyType: r.anomalyType }));
      r.networkErrors?.forEach((e) => cats.push(categoriseError({ statusCode: e.status, message: e.url })));
      r.consoleErrors?.forEach((e) => cats.push(categoriseError({ message: e, type: "console-error" })));
      return cats;
    })
  ) : [];

  return (
    <div className="runner">
      <div className="runner-left">
        <h2 className="section-title">Run Tests</h2>
        <p className="runner-description">Executes the generated Playwright specs and records observations.</p>

        <button className={`runner-btn ${runStatus === "running" ? "running" : ""}`} onClick={startTests} disabled={runStatus === "running"}>
          {runStatus === "running" ? "Running..." : "Run Tests"}
        </button>

        <div className="log-header" style={{ marginTop: 24 }}>
          <span className="section-title" style={{ fontSize: 13 }}>Progress</span>
          {runStatus !== "idle" && (
            <span className={`status-badge ${runStatus}`}>
              {runStatus === "running" && "● Running"}
              {runStatus === "done" && "Done"}
              {runStatus === "error" && "Error"}
            </span>
          )}
        </div>

        <div className="log-feed">
          {runLogs.length === 0 && runStatus === "idle" && <p className="log-empty">Click "Run Tests" to start.</p>}
          {runLogs.map((line, i) => (
            <div key={i} className={`log-line ${line.startsWith("[stderr]") ? "log-error" : line.includes("✓") ? "log-pass" : line.includes("✗") || line.includes("⚠") ? "log-fail" : ""}`}>{line}</div>
          ))}
          <div ref={logsEndRef} />
        </div>

        {summary && (
          <div className="runner-summary">
            <div className="runner-summary-row"><span className="rs-label">Total</span><span className="rs-value">{summary.total}</span></div>
            <div className="runner-summary-row"><span className="rs-label">Passed</span><span className="rs-value rs-pass">{summary.passed}</span></div>
            <div className="runner-summary-row"><span className="rs-label">Failed</span><span className="rs-value rs-fail">{summary.failed}</span></div>
            <div className="runner-summary-row"><span className="rs-label">Errored</span><span className="rs-value rs-error">{summary.errored}</span></div>
          </div>
        )}

        {runStatus === "done" && (
          <button className={`report-btn ${reportStatus === "running" ? "running" : ""}`} onClick={generateReport} disabled={reportStatus === "running" || reportStatus === "done"}>
            {reportStatus === "running" ? "Generating..." : reportStatus === "done" ? "Report Generated" : "Generate Report"}
          </button>
        )}

        <div className="fuzz-divider" style={{ margin: "20px 0" }} />

        <h2 className="section-title">Improve Tests</h2>
        <p className="runner-description">Analyses failures from the runner and generates improved targeted test cases.</p>

        <button
          className={`runner-btn improve-btn ${improveStatus === "running" ? "running" : ""}`}
          onClick={startImprove}
          disabled={improveStatus === "running" || runStatus !== "done"}
          title={runStatus !== "done" ? "Run tests first" : ""}
        >
          {improveStatus === "running" ? "Improving..." : "Improve Tests"}
        </button>

        <div className="log-header" style={{ marginTop: 16 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Progress</span>
          {improveStatus !== "idle" && (
            <span className={`status-badge ${improveStatus}`}>
              {improveStatus === "running" && "● Running"}
              {improveStatus === "done" && "Done"}
              {improveStatus === "error" && "Error"}
            </span>
          )}
        </div>

        <div className="log-feed" style={{ height: 120 }}>
          {improveLogs.length === 0 && improveStatus === "idle" && <p className="log-empty">Run tests first, then click "Improve Tests".</p>}
          {improveLogs.map((line, i) => (
            <div key={i} className={`log-line ${line.startsWith("[stderr]") ? "log-error" : ""}`}>{line}</div>
          ))}
          <div ref={improveLogsEndRef} />
        </div>

        {improvedResults && (
          <div className="runner-summary" style={{ marginTop: 8 }}>
            <div className="runner-summary-row">
              <span className="rs-label">Improved tests generated</span>
              <span className="rs-value rs-pass">{improvedResults.meta?.length || 0}</span>
            </div>
          </div>
        )}

        {improveStatus === "done" && improvedResults?.meta?.length > 0 && (
          <button
            className="runner-btn"
            style={{ marginTop: 12 }}
            onClick={runImprovedTests}
            disabled={runStatus === "running"}
          >
            Run Improved Tests
          </button>
        )}
      </div>

      <div className="runner-right">
        {!results && <div className="runner-empty"><p>Run tests to see results here.</p></div>}

        {results && (
          <>
            <div className="runner-tabs">
              <button className={`runner-tab ${activeSection === "hard" ? "active" : ""}`} onClick={() => setActiveSection("hard")}>
                Hard Errors ({summary?.hardErrors?.length || 0})
              </button>
              <button className={`runner-tab ${activeSection === "failed" ? "active" : ""}`} onClick={() => setActiveSection("failed")}>
                Failed ({summary?.failed || 0})
              </button>
              <button className={`runner-tab ${activeSection === "categories" ? "active" : ""}`} onClick={() => setActiveSection("categories")}>
                Error Categories {errorCategories.length > 0 ? `(${errorCategories.length})` : ""}
              </button>
              <button className={`runner-tab ${activeSection === "analysis" ? "active" : ""}`} onClick={() => setActiveSection("analysis")}>
                AI Analysis
              </button>
              <button className={`runner-tab ${activeSection === "passed" ? "active" : ""}`} onClick={() => setActiveSection("passed")}>
                Passed ({summary?.passed || 0})
              </button>
              {improvedResults && (
                <button className={`runner-tab ${activeSection === "improved" ? "active" : ""}`} onClick={() => setActiveSection("improved")}>
                  Improved Run ({improvedResults.results?.length || 0})
                </button>
              )}
            </div>

            <div className="runner-content">
              {activeSection === "hard" && (
                <div>
                  {summary?.hardErrors?.length === 0 && <p className="runner-empty-section">No hard errors.</p>}
                  {summary?.hardErrors?.map((r) => <ResultCard key={r.id} result={r} />)}
                </div>
              )}

              {activeSection === "failed" && (
                <div>
                  {results.results.filter((r) => r.status === "failed").length === 0 && <p className="runner-empty-section">No failures.</p>}
                  {results.results.filter((r) => r.status === "failed").map((r) => <ResultCard key={r.id} result={r} />)}
                </div>
              )}

              {activeSection === "categories" && (
                <div>
                  {errorCategories.length === 0 && <p className="runner-empty-section">No errors to categorise.</p>}
                  {errorCategories.map(({ key, label, color, bg, border, count }) => {
                    const matchingResults = results.results.filter((r) => {
                      const cats = [];
                      if (r.errorMessage) cats.push(categoriseError({ message: r.errorMessage, anomalyType: r.anomalyType }));
                      r.networkErrors?.forEach((e) => cats.push(categoriseError({ statusCode: e.status })));
                      r.consoleErrors?.forEach((e) => cats.push(categoriseError({ message: e, type: "console-error" })));
                      return cats.includes(key);
                    });
                    return (
                      <div key={key} className="ec-group">
                        <div className="ec-group-header" style={{ background: bg, borderColor: border }}>
                          <span className="ec-group-label" style={{ color }}>{label}</span>
                          <span className="ec-group-count" style={{ color }}>{count} occurrence{count !== 1 ? "s" : ""} across {matchingResults.length} test{matchingResults.length !== 1 ? "s" : ""}</span>
                        </div>
                        {matchingResults.map((r) => (
                          <div key={r.id} className="ec-result-item">
                            <span className="ec-result-id">{r.id}</span>
                            <span className="ec-result-desc">{r.description}</span>
                            <span className="ec-result-error">{r.errorMessage || r.consoleErrors?.[0] || ""}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {activeSection === "analysis" && (
                <div className="runner-analysis">
                  {!results.report && <p className="runner-empty-section">Generate the report to see AI analysis.</p>}
                  {results.report && <pre className="runner-report-text">{results.report}</pre>}
                </div>
              )}

              {activeSection === "passed" && (
                <div>
                  {results.results.filter((r) => r.status === "passed").length === 0 && <p className="runner-empty-section">No passing tests yet.</p>}
                  {results.results.filter((r) => r.status === "passed").map((r) => (
                    <div key={r.id} className="runner-passed-item">
                      <span className="rp-id">{r.id}</span>
                      <span className="rp-desc">{r.description}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeSection === "improved" && improvedResults && (
                <div>
                  <p className="fuzz-tab-desc">Improved tests generated from observed failures — run alongside originals to compare coverage.</p>

                  <div className="fuzz-result-section-title">Improvement Map</div>
                  {improvedResults.meta?.map((m) => (
                    <div key={m.improvedId} className="ec-group">
                      <div className="ec-group-header" style={{ background: "#1a1d27", borderColor: "#2d3148" }}>
                        <span className="ec-result-id">{m.originalId}</span>
                        <span style={{ color: "#64748b", fontSize: 12 }}>→</span>
                        <span className="ec-result-id" style={{ color: "#a78bfa" }}>{m.improvedId}</span>
                        <span className="sm-error-cat-badge" style={{ background: "#22253a", color: "#94a3b8", border: "1px solid #4c4f6e", marginLeft: "auto" }}>{m.errorCategory}</span>
                        <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>{m.source}</span>
                      </div>
                    </div>
                  ))}

                  {improvedResults.results?.length > 0 && (
                    <>
                      <div className="fuzz-result-section-title" style={{ marginTop: 16 }}>Improved Run Results</div>
                      {improvedResults.results.map((r) => (
                        <div key={r.id} className={`result-card result-${r.status || "passed"}`}>
                          <div className="result-header">
                            <span className="result-id">{r.id}</span>
                            <span className={`result-status status-${r.status || "passed"}`}>{r.status || "recorded"}</span>
                          </div>
                          <p className="result-desc">{r.description}</p>
                          {r.observations && r.observations.length > 0 && (
                            <div className="result-field">
                              <span className="result-field-label">Observations</span>
                              <span className="result-field-value">{JSON.stringify(r.observations).slice(0, 200)}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}

                  {/* AI Analysis for improved run */}
                  <div className="fuzz-result-section-title" style={{ marginTop: 16 }}>AI Analysis</div>
                  {improvedResults.report ? (
                    <pre className="runner-report-text">{improvedResults.report}</pre>
                  ) : improvedResults.results?.length > 0 ? (
                    <button
                      className={`report-btn ${improvedReportStatus === "running" ? "running" : ""}`}
                      onClick={generateImprovedReport}
                      disabled={improvedReportStatus === "running" || improvedReportStatus === "done"}
                    >
                      {improvedReportStatus === "running" ? "Generating..." : improvedReportStatus === "done" ? "Report Generated" : "Generate AI Analysis"}
                    </button>
                  ) : (
                    <p className="runner-empty-section">Run improved tests first to generate AI analysis.</p>
                  )}

                  {improvedResults.spec && (
                    <>
                      <div className="fuzz-result-section-title" style={{ marginTop: 16 }}>Improved Spec File</div>
                      <div className="gen-spec">
                        <div className="gen-spec-filename">improved.spec.js</div>
                        <pre className="gen-spec-content">{improvedResults.spec}</pre>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ResultCard({ result }) {
  const primaryCat = result.errorMessage
    ? categoriseError({ message: result.errorMessage, anomalyType: result.anomalyType })
    : result.networkErrors?.length > 0
    ? categoriseError({ statusCode: result.networkErrors[0].status })
    : result.consoleErrors?.length > 0
    ? categoriseError({ message: result.consoleErrors[0], type: "console-error" })
    : null;
  const catDef = primaryCat ? ERROR_CATEGORIES[primaryCat] : null;

  return (
    <div className={`result-card result-${result.status}`}>
      <div className="result-header">
        <span className="result-id">{result.id}</span>
        <span className={`result-status status-${result.status}`}>{result.status}</span>
        {catDef && (
          <span className="sm-error-cat-badge" style={{ background: catDef.bg, color: catDef.color, border: `1px solid ${catDef.border}` }}>{catDef.label}</span>
        )}
      </div>
      <p className="result-desc">{result.description}</p>
      {result.errorMessage && (
        <div className="result-field">
          <span className="result-field-label">Error</span>
          <span className="result-field-value">{result.errorMessage}</span>
        </div>
      )}
      {result.networkErrors?.length > 0 && (
        <div className="result-field">
          <span className="result-field-label">Network</span>
          <span className="result-field-value">{result.networkErrors.map((e) => `${e.status} ${e.url}`).join(", ")}</span>
        </div>
      )}
      {result.consoleErrors?.length > 0 && (
        <div className="result-field">
          <span className="result-field-label">Console</span>
          <span className="result-field-value">{result.consoleErrors[0]}</span>
        </div>
      )}
    </div>
  );
}