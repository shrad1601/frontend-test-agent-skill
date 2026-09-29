// ui/src/pages/Generator.jsx
import { useState, useRef, useEffect } from "react";
import "./Generator.css";

const TYPE_COLORS = {
  "happy-path": "green",
  "validation": "blue",
  "edge-case": "orange",
  "error-scenario": "red"
};

export default function Generator({ onGenerateDone }) {
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("cases");
  const [regenStatus, setRegenStatus] = useState("idle");
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    fetch("/api/generator/results")
      .then((r) => r.json())
      .then((d) => {
        if (d.cases?.length > 0) {
          setResults(d);
          setStatus("done");
        }
      })
      .catch(() => {});
  }, []);

  async function startGenerate() {
    setStatus("running");
    setLogs([]);
    setResults(null);
    setRegenStatus("idle");

    try {
      const res = await fetch("/api/generate", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        setStatus("error");
        setLogs([`Error: ${err.error}`]);
        return;
      }
    } catch (err) {
      setStatus("error");
      setLogs([`Failed to reach backend: ${err.message}`]);
      return;
    }

    const es = new EventSource("/api/generate/stream");

    es.onmessage = (e) => {
      const { line } = JSON.parse(e.data);
      setLogs((prev) => [...prev, line]);
    };

    es.addEventListener("done", async (e) => {
      const { status: finalStatus } = JSON.parse(e.data);
      setStatus(finalStatus);
      es.close();

      if (finalStatus === "done") {
        const r = await fetch("/api/generator/results").then((res) => res.json());
        setResults(r);
        onGenerateDone();
      }
    });

    es.onerror = () => es.close();
  }

  async function regenerateData() {
    setRegenStatus("running");
    try {
      const d = await fetch("/api/generate-data", { method: "POST" }).then(r => r.json());
      if (d.error) { setRegenStatus("error"); return; }
      const r = await fetch("/api/generator/results").then(r => r.json());
      setResults(r);
      setRegenStatus("done");
    } catch {
      setRegenStatus("error");
    }
  }

  const totalCases = results?.cases?.reduce((n, f) => n + (f.cases?.length || 0), 0) || 0;

  return (
    <div className="generator">
      <div className="gen-left">
        <h2 className="section-title">Generate Tests</h2>
        <p className="gen-description">
          Reads the crawl data and generates test cases, test data, and Playwright specs.
        </p>

        <button
          className={`gen-btn ${status === "running" ? "running" : ""}`}
          onClick={startGenerate}
          disabled={status === "running"}
        >
          {status === "running" ? "Generating..." : "Run Generator"}
        </button>

        {status === "done" && (
          <button
            className="gen-btn"
            style={{ marginTop: 8, background: "#1e3a5f", color: "#60a5fa", border: "1px solid #2d4a7f" }}
            onClick={regenerateData}
            disabled={regenStatus === "running"}
          >
            {regenStatus === "running" ? "Regenerating..." : regenStatus === "done" ? "Data Regenerated" : "Regenerate Test Data"}
          </button>
        )}

        <div className="log-header" style={{ marginTop: 24 }}>
          <span className="section-title" style={{ fontSize: 13 }}>Progress</span>
          {status !== "idle" && (
            <span className={`status-badge ${status}`}>
              {status === "running" && "● Running"}
              {status === "done" && "Done"}
              {status === "error" && "Error"}
            </span>
          )}
        </div>

        <div className="log-feed">
          {logs.length === 0 && status === "idle" && (
            <p className="log-empty">Click "Run Generator" to start.</p>
          )}
          {logs.map((line, i) => (
            <div key={i} className={`log-line ${line.startsWith("[stderr]") ? "log-error" : ""}`}>
              {line}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>

        {status === "done" && (
          <div className="done-banner">
            Generated {totalCases} test cases
          </div>
        )}
      </div>

      <div className="gen-right">
        <div className="gen-tabs">
          <button
            className={`gen-tab ${activeTab === "cases" ? "active" : ""}`}
            onClick={() => setActiveTab("cases")}
          >
            Test Cases {results && `(${totalCases})`}
          </button>
          <button
            className={`gen-tab ${activeTab === "data" ? "active" : ""}`}
            onClick={() => setActiveTab("data")}
          >
            Test Data
          </button>
          <button
            className={`gen-tab ${activeTab === "specs" ? "active" : ""}`}
            onClick={() => setActiveTab("specs")}
          >
            Spec Files
          </button>
        </div>

        <div className="gen-content">
          {!results && (
            <p className="gen-empty">Run the generator to see results here.</p>
          )}

          {results && activeTab === "cases" && (
            <div className="gen-cases">
              {results.cases.map((featureObj, fi) => (
                <div key={fi} className="gen-feature-group">
                  <div className="gen-feature-title">{featureObj.feature}</div>
                  {featureObj.cases?.map((tc) => (
                    <div key={tc.id} className="gen-case-card">
                      <div className="gen-case-header">
                        <span className="gen-case-id">{tc.id}</span>
                        <span className={`gen-case-type type-${TYPE_COLORS[tc.type] || "blue"}`}>
                          {tc.type}
                        </span>
                      </div>
                      <p className="gen-case-desc">{tc.description}</p>
                      <div className="gen-case-meta">
                        <span>{tc.page}</span>
                        <span>{tc.action}</span>
                      </div>
                      {tc.dataNeeded && tc.dataNeeded !== "none" && (
                        <div className="gen-case-data-needed">
                          Data: {typeof tc.dataNeeded === "object"
                            ? JSON.stringify(tc.dataNeeded)
                            : tc.dataNeeded}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {results && activeTab === "data" && (
            <div className="gen-data">
              {results.data.map((featureObj, fi) => (
                <div key={fi} className="gen-feature-group">
                  <div className="gen-feature-title">{featureObj.feature}</div>
                  {Object.entries(featureObj.data || {}).map(([id, data]) => (
                    <div key={id} className="gen-data-row">
                      <span className="gen-data-id">{id}</span>
                      <pre className="gen-data-value">
                        {data === null || data === undefined
                          ? "null (no data needed)"
                          : typeof data === "object"
                            ? JSON.stringify(data, null, 2)
                            : String(data)}
                      </pre>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {results && activeTab === "specs" && (
            <div className="gen-specs">
              {results.specs.map((spec, i) => (
                <div key={i} className="gen-spec">
                  <div className="gen-spec-filename">{spec.filename}</div>
                  <pre className="gen-spec-content">{spec.content}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}