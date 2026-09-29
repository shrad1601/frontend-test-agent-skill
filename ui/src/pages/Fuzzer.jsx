// ui/src/pages/Fuzzer.jsx
import { useState, useRef, useEffect } from "react";
import "./Fuzzer.css";
import { categoriseError, buildCategoryBreakdown, ERROR_CATEGORIES } from "../utils/errorCategories.js";

export default function Fuzzer() {
  const [targetURL, setTargetURL] = useState("");
  const [apiFuzzStatus, setApiFuzzStatus] = useState("idle");
  const [apiFuzzLogs, setApiFuzzLogs] = useState([]);
  const [frontendFuzzStatus, setFrontendFuzzStatus] = useState("idle");
  const [frontendFuzzLogs, setFrontendFuzzLogs] = useState([]);
  const [apiResults, setApiResults] = useState(null);
  const [frontendResults, setFrontendResults] = useState(null);
  const [fuzzFiles, setFuzzFiles] = useState(null);
  const [activeTab, setActiveTab] = useState("cases");
  const [improveStatus, setImproveStatus] = useState("idle");
  const [improveLogs, setImproveLogs] = useState([]);
  const [improvedResults, setImprovedResults] = useState(null);
  const apiLogsEndRef = useRef(null);
  const frontendLogsEndRef = useRef(null);
  const improveLogsEndRef = useRef(null);

  useEffect(() => { apiLogsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [apiFuzzLogs]);
  useEffect(() => { frontendLogsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [frontendFuzzLogs]);
  useEffect(() => { improveLogsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [improveLogs]);

  useEffect(() => {
    fetch("/api/fuzz/results").then((r) => r.json()).then((d) => { if (d.results) { setApiResults(d); setApiFuzzStatus("done"); } }).catch(() => {});
    fetch("/api/fuzz-frontend/results").then((r) => r.json()).then((d) => { if (d.results) { setFrontendResults(d); setFrontendFuzzStatus("done"); } }).catch(() => {});
    fetch("/api/fuzz/files").then((r) => r.json()).then((d) => { if (d.cases) setFuzzFiles(d); }).catch(() => {});
    fetch("/api/improve-tests/results").then((r) => r.json()).then((d) => { if (d.meta) setImprovedResults(d); }).catch(() => {});
  }, []);

  async function startApiFuzz() {
    if (!targetURL.trim()) { alert("Please enter a target URL first."); return; }
    setApiFuzzStatus("running");
    setApiFuzzLogs([]);
    setApiResults(null);
    setFuzzFiles(null);
    try {
      const res = await fetch("/api/fuzz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseURL: targetURL.trim() })
      });
      if (!res.ok) { const err = await res.json(); setApiFuzzStatus("error"); setApiFuzzLogs([`Error: ${err.error}`]); return; }
    } catch (err) { setApiFuzzStatus("error"); setApiFuzzLogs([`Failed to reach backend: ${err.message}`]); return; }

    const es = new EventSource("/api/fuzz/stream");
    es.onmessage = (e) => { const { line } = JSON.parse(e.data); setApiFuzzLogs((prev) => [...prev, line]); };
    es.addEventListener("done", async (e) => {
      const { status: finalStatus } = JSON.parse(e.data);
      setApiFuzzStatus(finalStatus);
      es.close();
      if (finalStatus === "done") {
        const d = await fetch("/api/fuzz/results").then((r) => r.json());
        setApiResults(d);
        const f = await fetch("/api/fuzz/files").then((r) => r.json());
        if (f.cases) setFuzzFiles(f);
      }
    });
    es.onerror = () => es.close();
  }

  async function startFrontendFuzz() {
    setFrontendFuzzStatus("running");
    setFrontendFuzzLogs([]);
    setFrontendResults(null);
    try {
      const res = await fetch("/api/fuzz-frontend", { method: "POST" });
      if (!res.ok) { const err = await res.json(); setFrontendFuzzStatus("error"); setFrontendFuzzLogs([`Error: ${err.error}`]); return; }
    } catch (err) { setFrontendFuzzStatus("error"); setFrontendFuzzLogs([`Failed to reach backend: ${err.message}`]); return; }

    const es = new EventSource("/api/fuzz-frontend/stream");
    es.onmessage = (e) => { const { line } = JSON.parse(e.data); setFrontendFuzzLogs((prev) => [...prev, line]); };
    es.addEventListener("done", async (e) => {
      const { status: finalStatus } = JSON.parse(e.data);
      setFrontendFuzzStatus(finalStatus);
      es.close();
      if (finalStatus === "done") {
        const d = await fetch("/api/fuzz-frontend/results").then((r) => r.json());
        setFrontendResults(d);
        const f = await fetch("/api/fuzz/files").then((r) => r.json());
        if (f.cases) setFuzzFiles(f);
      }
    });
    es.onerror = () => es.close();
  }

  async function startImproveFuzz() {
    setImproveStatus("running");
    setImproveLogs([]);
    setImprovedResults(null);
    try {
      const res = await fetch("/api/improve-fuzz", { method: "POST" });
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

  const apiAnomalies = apiResults?.results?.filter((r) => r.anomaly) || [];
  const apiClean = apiResults?.results?.filter((r) => !r.anomaly) || [];
  const frontendAnomalies = frontendResults?.results?.filter((r) => r.anomaly) || [];
  const frontendClean = frontendResults?.results?.filter((r) => !r.anomaly) || [];
  const hasAnalysis = apiResults?.report || frontendResults?.report;
  const hasFuzzResults = apiResults || frontendResults;

  const apiCategories = apiResults?.results ? buildCategoryBreakdown(
    apiResults.results.filter((r) => r.anomaly).map((r) =>
      categoriseError({ statusCode: r.statusCode, message: r.responseBody, anomalyType: r.anomalyType, type: r.error })
    )
  ) : [];

  const frontendCategories = frontendResults?.results ? buildCategoryBreakdown(
    frontendResults.results.filter((r) => r.anomaly).map((r) =>
      categoriseError({ message: r.errorMessage, anomalyType: r.anomalyType })
    )
  ) : [];

  return (
    <div className="fuzzer">
      <div className="fuzz-left">
        <div className="fuzz-url-section">
          <h2 className="section-title">Target URL</h2>
          <input
            type="url"
            className="fuzz-url-input"
            placeholder="https://example.com"
            value={targetURL}
            onChange={(e) => setTargetURL(e.target.value)}
            disabled={apiFuzzStatus === "running" || frontendFuzzStatus === "running"}
          />
          <p className="fuzz-url-hint">API fuzzing works on any URL. Frontend fuzzing requires a prior crawl in the Configure tab.</p>
        </div>

        <div className="fuzz-divider" />

        <div className="fuzz-section">
          <h2 className="section-title">Fuzz API</h2>
          <p className="fuzz-description">Sends malformed inputs directly to API endpoints via HTTP — no browser needed. Tests server-side crash resistance and error handling.</p>
          <button className={`fuzz-btn ${apiFuzzStatus === "running" ? "running" : ""}`} onClick={startApiFuzz} disabled={apiFuzzStatus === "running"}>
            {apiFuzzStatus === "running" ? "Running..." : "Run API Fuzz"}
          </button>
          <div className="log-header" style={{ marginTop: 16 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Progress</span>
            {apiFuzzStatus !== "idle" && (
              <span className={`status-badge ${apiFuzzStatus}`}>
                {apiFuzzStatus === "running" && "● Running"}
                {apiFuzzStatus === "done" && "Done"}
                {apiFuzzStatus === "error" && "Error"}
              </span>
            )}
          </div>
          <div className="log-feed" style={{ height: 150 }}>
            {apiFuzzLogs.length === 0 && apiFuzzStatus === "idle" && <p className="log-empty">Enter a URL and click "Run API Fuzz" to start.</p>}
            {apiFuzzLogs.map((line, i) => (
              <div key={i} className={`log-line ${line.includes("⚠") ? "log-warn" : line.startsWith("[stderr]") ? "log-error" : ""}`}>{line}</div>
            ))}
            <div ref={apiLogsEndRef} />
          </div>
          {apiResults && (
            <div className="fuzz-summary" style={{ marginTop: 8 }}>
              <div className="fuzz-summary-row"><span className="fs-label">Total</span><span className="fs-value">{apiResults.results.length}</span></div>
              <div className="fuzz-summary-row"><span className="fs-label">Anomalies</span><span className="fs-value fs-warn">{apiAnomalies.length}</span></div>
              <div className="fuzz-summary-row"><span className="fs-label">Clean</span><span className="fs-value fs-pass">{apiClean.length}</span></div>
            </div>
          )}
        </div>

        <div className="fuzz-divider" />

        <div className="fuzz-section">
          <h2 className="section-title">Fuzz Frontend</h2>
          <p className="fuzz-description">Fills forms with boundary inputs in a real browser and observes UI and backend behavior. Requires a prior crawl in the Configure tab.</p>
          <button className={`fuzz-btn fuzz-btn-frontend ${frontendFuzzStatus === "running" ? "running" : ""}`} onClick={startFrontendFuzz} disabled={frontendFuzzStatus === "running"}>
            {frontendFuzzStatus === "running" ? "Running..." : "Run Frontend Fuzz"}
          </button>
          <p className="fuzz-prereq">Requires a crawl from the Configure tab first.</p>
          <div className="log-header" style={{ marginTop: 16 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Progress</span>
            {frontendFuzzStatus !== "idle" && (
              <span className={`status-badge ${frontendFuzzStatus}`}>
                {frontendFuzzStatus === "running" && "● Running"}
                {frontendFuzzStatus === "done" && "Done"}
                {frontendFuzzStatus === "error" && "Error"}
              </span>
            )}
          </div>
          <div className="log-feed" style={{ height: 150 }}>
            {frontendFuzzLogs.length === 0 && frontendFuzzStatus === "idle" && <p className="log-empty">Click "Run Frontend Fuzz" to start.</p>}
            {frontendFuzzLogs.map((line, i) => (
              <div key={i} className={`log-line ${line.includes("⚠") ? "log-warn" : line.startsWith("[stderr]") ? "log-error" : ""}`}>{line}</div>
            ))}
            <div ref={frontendLogsEndRef} />
          </div>
          {frontendResults && (
            <div className="fuzz-summary" style={{ marginTop: 8 }}>
              <div className="fuzz-summary-row"><span className="fs-label">Total</span><span className="fs-value">{frontendResults.results.length}</span></div>
              <div className="fuzz-summary-row"><span className="fs-label">Anomalies</span><span className="fs-value fs-warn">{frontendAnomalies.length}</span></div>
              <div className="fuzz-summary-row"><span className="fs-label">Clean</span><span className="fs-value fs-pass">{frontendClean.length}</span></div>
            </div>
          )}
        </div>

        <div className="fuzz-divider" />

        <div className="fuzz-section">
          <h2 className="section-title">Improve Fuzz Tests</h2>
          <p className="fuzz-description">Analyses anomalies from API and frontend fuzzing and generates improved targeted test cases.</p>
          <button
            className={`fuzz-btn ${improveStatus === "running" ? "running" : ""}`}
            onClick={startImproveFuzz}
            disabled={improveStatus === "running" || !hasFuzzResults}
            title={!hasFuzzResults ? "Run API Fuzz or Frontend Fuzz first" : ""}
          >
            {improveStatus === "running" ? "Improving..." : "Improve Fuzz Tests"}
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
            {improveLogs.length === 0 && improveStatus === "idle" && <p className="log-empty">Run API Fuzz or Frontend Fuzz first, then click "Improve Fuzz Tests".</p>}
            {improveLogs.map((line, i) => (
              <div key={i} className={`log-line ${line.startsWith("[stderr]") ? "log-error" : ""}`}>{line}</div>
            ))}
            <div ref={improveLogsEndRef} />
          </div>
          {improvedResults && (
            <div className="fuzz-summary" style={{ marginTop: 8 }}>
              <div className="fuzz-summary-row">
                <span className="fs-label">Improved tests generated</span>
                <span className="fs-value fs-pass">{improvedResults.meta?.length || 0}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fuzz-right">
        {!apiResults && !frontendResults && !fuzzFiles && (
          <div className="fuzz-empty"><p>Enter a URL and run API Fuzz or Frontend Fuzz to see results here.</p></div>
        )}

        {(apiResults || frontendResults || fuzzFiles) && (
          <>
            <div className="fuzz-tabs">
              <button className={`fuzz-tab ${activeTab === "cases" ? "active" : ""}`} onClick={() => setActiveTab("cases")}>
                Test Cases {fuzzFiles ? `(${fuzzFiles.cases?.length || 0})` : ""}
              </button>
              <button className={`fuzz-tab ${activeTab === "data" ? "active" : ""}`} onClick={() => setActiveTab("data")}>Test Data</button>
              <button className={`fuzz-tab ${activeTab === "specs" ? "active" : ""}`} onClick={() => setActiveTab("specs")}>Spec File</button>
              <button className={`fuzz-tab ${activeTab === "api-results" ? "active" : ""}`} onClick={() => setActiveTab("api-results")}>
                API Results {apiResults ? `(${apiAnomalies.length} anomalies)` : ""}
              </button>
              <button className={`fuzz-tab ${activeTab === "frontend-results" ? "active" : ""}`} onClick={() => setActiveTab("frontend-results")}>
                Frontend Results {frontendResults ? `(${frontendAnomalies.length} anomalies)` : ""}
              </button>
              <button className={`fuzz-tab ${activeTab === "categories" ? "active" : ""}`} onClick={() => setActiveTab("categories")}>
                Error Categories
              </button>
              <button className={`fuzz-tab ${activeTab === "analysis" ? "active" : ""}`} onClick={() => setActiveTab("analysis")}>AI Analysis</button>
              {improvedResults && (
                <button className={`fuzz-tab ${activeTab === "improved" ? "active" : ""}`} onClick={() => setActiveTab("improved")}>
                  Improved Tests ({improvedResults.meta?.length || 0})
                </button>
              )}
            </div>

            <div className="fuzz-content">

              {activeTab === "cases" && (
                <div>
                  {!fuzzFiles?.cases?.length && <p className="fuzz-empty-section">No test cases yet — run API Fuzz first.</p>}
                  {fuzzFiles?.cases?.map((tc) => (
                    <div key={tc.id} className="fuzz-card fuzz-card-case">
                      <div className="fuzz-card-header">
                        <span className="fuzz-card-id">{tc.id}</span>
                        <span className={`fuzz-card-type-badge type-${tc.type}`}>{tc.type}</span>
                        <span className={`fuzz-method fuzz-method-${tc.method?.toLowerCase()}`}>{tc.method}</span>
                      </div>
                      <p className="fuzz-card-desc">{tc.description}</p>
                      <div className="fuzz-card-meta">
                        <span className="fuzz-meta-label">Endpoint</span>
                        <code className="fuzz-meta-value">{tc.endpoint}</code>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "data" && (
                <div>
                  {!fuzzFiles?.data && <p className="fuzz-empty-section">No test data yet — run API Fuzz first.</p>}
                  {fuzzFiles?.data && Object.entries(fuzzFiles.data).map(([id, input]) => (
                    <div key={id} className="fuzz-data-row">
                      <span className="fuzz-data-id">{id}</span>
                      <pre className="fuzz-data-value">{input === null ? "null" : JSON.stringify(input, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "specs" && (
                <div>
                  {!fuzzFiles?.spec && <p className="fuzz-empty-section">No spec file yet — run Frontend Fuzz first.</p>}
                  {fuzzFiles?.spec && (
                    <div className="gen-spec">
                      <div className="gen-spec-filename">fuzz.spec.js</div>
                      <pre className="gen-spec-content">{fuzzFiles.spec}</pre>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "api-results" && (
                <div>
                  {!apiResults && <p className="fuzz-empty-section">No API fuzz results yet — run API Fuzz first.</p>}
                  {apiResults && (
                    <>
                      <p className="fuzz-tab-desc">Direct HTTP requests to observed/inferred endpoints with boundary and invalid inputs.</p>
                      {apiAnomalies.length > 0 && (
                        <>
                          <div className="fuzz-result-section-title">Anomalies ({apiAnomalies.length})</div>
                          {apiAnomalies.map((r) => <FuzzResultCard key={r.id} result={r} />)}
                        </>
                      )}
                      {apiClean.length > 0 && (
                        <>
                          <div className="fuzz-result-section-title">Clean ({apiClean.length})</div>
                          {apiClean.map((r) => <FuzzCleanCard key={r.id} result={r} />)}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTab === "frontend-results" && (
                <div>
                  {!frontendResults && <p className="fuzz-empty-section">No frontend fuzz results yet — run Frontend Fuzz first.</p>}
                  {frontendResults && (
                    <>
                      <p className="fuzz-tab-desc">Browser-based form submission with boundary and malformed data — tests full stack behavior.</p>
                      {frontendAnomalies.length > 0 && (
                        <>
                          <div className="fuzz-result-section-title">Anomalies ({frontendAnomalies.length})</div>
                          {frontendAnomalies.map((r) => <FuzzResultCard key={r.id} result={r} />)}
                        </>
                      )}
                      {frontendClean.length > 0 && (
                        <>
                          <div className="fuzz-result-section-title">Clean ({frontendClean.length})</div>
                          {frontendClean.map((r) => <FuzzCleanCard key={r.id} result={r} />)}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTab === "categories" && (
                <div>
                  {apiCategories.length === 0 && frontendCategories.length === 0 && (
                    <p className="fuzz-empty-section">No anomalies to categorise yet — run API Fuzz or Frontend Fuzz first.</p>
                  )}
                  {apiCategories.length > 0 && (
                    <>
                      <div className="fuzz-result-section-title">API Fuzz — Error Categories</div>
                      {apiCategories.map(({ key, label, color, bg, border, count }) => {
                        const matching = apiAnomalies.filter((r) =>
                          categoriseError({ statusCode: r.statusCode, message: r.responseBody, anomalyType: r.anomalyType }) === key
                        );
                        return (
                          <div key={key} className="ec-group" style={{ borderColor: border }}>
                            <div className="ec-group-header" style={{ background: bg, borderColor: border }}>
                              <span className="ec-group-label" style={{ color }}>{label}</span>
                              <span className="ec-group-count" style={{ color }}>{count} occurrence{count !== 1 ? "s" : ""} across {matching.length} test{matching.length !== 1 ? "s" : ""}</span>
                            </div>
                            {matching.map((r) => (
                              <div key={r.id} className="ec-result-item">
                                <span className="ec-result-id">{r.id}</span>
                                <span className="ec-result-desc">{r.description}</span>
                                <span className="ec-result-error">{r.anomalyType} — {r.statusCode || ""}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </>
                  )}
                  {frontendCategories.length > 0 && (
                    <>
                      <div className="fuzz-result-section-title" style={{ marginTop: 16 }}>Frontend Fuzz — Error Categories</div>
                      {frontendCategories.map(({ key, label, color, bg, border, count }) => {
                        const matching = frontendAnomalies.filter((r) =>
                          categoriseError({ message: r.errorMessage, anomalyType: r.anomalyType }) === key
                        );
                        return (
                          <div key={key} className="ec-group" style={{ borderColor: border }}>
                            <div className="ec-group-header" style={{ background: bg, borderColor: border }}>
                              <span className="ec-group-label" style={{ color }}>{label}</span>
                              <span className="ec-group-count" style={{ color }}>{count} occurrence{count !== 1 ? "s" : ""} across {matching.length} test{matching.length !== 1 ? "s" : ""}</span>
                            </div>
                            {matching.map((r) => (
                              <div key={r.id} className="ec-result-item">
                                <span className="ec-result-id">{r.id}</span>
                                <span className="ec-result-desc">{r.description}</span>
                                <span className="ec-result-error">{r.anomalyType}{r.errorMessage ? ` — ${r.errorMessage}` : ""}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {activeTab === "analysis" && (
                <div>
                  {!hasAnalysis && <p className="fuzz-empty-section">No AI analysis yet — run API Fuzz or Frontend Fuzz first.</p>}
                  {apiResults?.report && (
                    <>
                      <div className="fuzz-result-section-title">API Fuzz Analysis</div>
                      <pre className="fuzz-report-text">{apiResults.report}</pre>
                    </>
                  )}
                  {frontendResults?.report && (
                    <>
                      <div className="fuzz-result-section-title">Frontend Fuzz Analysis</div>
                      <pre className="fuzz-report-text">{frontendResults.report}</pre>
                    </>
                  )}
                </div>
              )}

              {activeTab === "improved" && improvedResults && (
                <div>
                  <p className="fuzz-tab-desc">Improved tests generated from observed anomalies — targeting specific failure modes.</p>
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

function FuzzResultCard({ result }) {
  const timeMs = result.durationMs ?? result.responseTime;
  const cat = categoriseError({ statusCode: result.statusCode, message: result.errorMessage || result.responseBody, anomalyType: result.anomalyType });
  const catDef = ERROR_CATEGORIES[cat];

  return (
    <div className="fuzz-card fuzz-card-anomaly">
      <div className="fuzz-card-header">
        <span className="fuzz-card-id">{result.id}</span>
        <span className="fuzz-card-status">{result.statusCode || result.postSubmission?.statusCodesObserved?.join(", ") || "no response"}</span>
        <span className="fuzz-card-type">{result.type}</span>
        <span className="sm-error-cat-badge" style={{ background: catDef.bg, color: catDef.color, border: `1px solid ${catDef.border}` }}>{catDef.label}</span>
      </div>
      <p className="fuzz-card-desc">{result.description}</p>
      {result.anomalyType && <div className="fuzz-card-anomaly-type">{result.anomalyType}</div>}
      {result.input && (
        <div className="fuzz-card-meta">
          <span className="fuzz-meta-label">Input</span>
          <code className="fuzz-meta-value">{JSON.stringify(result.input)}</code>
        </div>
      )}
      {result.postSubmission?.finalURL && (
        <div className="fuzz-card-meta">
          <span className="fuzz-meta-label">Final URL</span>
          <code className="fuzz-meta-value">{result.postSubmission.finalURL}</code>
        </div>
      )}
      {result.responseBody && (
        <div className="fuzz-card-meta">
          <span className="fuzz-meta-label">Response</span>
          <code className="fuzz-meta-value">{result.responseBody}</code>
        </div>
      )}
      {result.errorMessage && (
        <div className="fuzz-card-meta">
          <span className="fuzz-meta-label">Error</span>
          <code className="fuzz-meta-value">{result.errorMessage}</code>
        </div>
      )}
      <div className="fuzz-card-meta">
        <span className="fuzz-meta-label">Time</span>
        <span className="fuzz-meta-value">{timeMs != null ? `${timeMs}ms` : "—"}</span>
      </div>
    </div>
  );
}

function FuzzCleanCard({ result }) {
  const timeMs = result.durationMs ?? result.responseTime;
  return (
    <div className="fuzz-card fuzz-card-clean">
      <div className="fuzz-card-header">
        <span className="fuzz-card-id">{result.id}</span>
        <span className="fuzz-card-status fuzz-status-ok">{result.statusCode || result.status}</span>
        <span className="fuzz-card-type">{result.type}</span>
      </div>
      <p className="fuzz-card-desc">{result.description}</p>
      {result.postSubmission?.finalURL && (
        <div className="fuzz-card-meta">
          <span className="fuzz-meta-label">Final URL</span>
          <code className="fuzz-meta-value">{result.postSubmission.finalURL}</code>
        </div>
      )}
      <div className="fuzz-card-meta">
        <span className="fuzz-meta-label">Time</span>
        <span className="fuzz-meta-value">{timeMs != null ? `${timeMs}ms` : "—"}</span>
      </div>
    </div>
  );
}