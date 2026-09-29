// ui/src/pages/Configure.jsx
import { useState, useRef, useEffect } from "react";
import "./Configure.css";

const DEFAULT_FORM = {
  baseURL: "",
  maxPages: 30,
  maxDepth: 5,
  seedPaths: "",
  auth: {
    type: "none",
    loginURL: "/login",
    usernameSelector: "#email",
    passwordSelector: "#password",
    submitSelector: "#login-button",
    username: "",
    password: "",
    successURLContains: "/dashboard",
    bearerToken: "",
    cookieName: "session_id",
    cookieValue: "",
    cookieDomain: ""
  }
};

export default function Configure({ onCrawlDone }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function setField(path, value) {
    setForm((prev) => {
      const next = { ...prev };
      const parts = path.split(".");
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...obj[parts[i]] };
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  }

  async function startCrawl() {
    if (!form.baseURL.trim()) {
      alert("Please enter a URL first.");
      return;
    }

    setStatus("crawling");
    setLogs([]);

    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      if (!res.ok) {
        const err = await res.json();
        setStatus("error");
        setLogs([`Error: ${err.error}`]);
        return;
      }
    } catch (err) {
      setStatus("error");
      setLogs([
        `Failed to reach backend server: ${err.message}`,
        "Is the server running? Run: npm run server"
      ]);
      return;
    }

    const es = new EventSource("/api/crawl/stream");

    es.onmessage = (e) => {
      const { line } = JSON.parse(e.data);
      setLogs((prev) => [...prev, line]);
    };

    es.addEventListener("done", (e) => {
      const { status: finalStatus } = JSON.parse(e.data);
      setStatus(finalStatus);
      es.close();
      if (finalStatus === "done") onCrawlDone();
    });

    es.onerror = () => es.close();
  }

  const authType = form.auth.type;

  return (
    <div className="configure">
      <div className="configure-left">
        <h2 className="section-title">Configure Crawl</h2>

        <div className="field-group">
          <label>Target URL</label>
          <input
            type="url"
            placeholder="http://localhost:5173"
            value={form.baseURL}
            onChange={(e) => setField("baseURL", e.target.value)}
            disabled={status === "crawling"}
          />
        </div>

        <div className="field-row">
          <div className="field-group">
            <label>Max Pages</label>
            <input
              type="number"
              min={1}
              max={100}
              value={form.maxPages}
              onChange={(e) => setField("maxPages", Number(e.target.value))}
              disabled={status === "crawling"}
            />
          </div>
          <div className="field-group">
            <label>Max Depth</label>
            <input
              type="number"
              min={1}
              max={10}
              value={form.maxDepth}
              onChange={(e) => setField("maxDepth", Number(e.target.value))}
              disabled={status === "crawling"}
            />
          </div>
        </div>

        <div className="field-group">
          <label>Seed Paths <span style={{ color: "#64748b", fontWeight: 400, fontSize: 12 }}>(optional — one per line)</span></label>
          <textarea
            placeholder={`/text-box\n/practice-form\n/webtables`}
            value={form.seedPaths}
            onChange={(e) => setField("seedPaths", e.target.value)}
            disabled={status === "crawling"}
            rows={4}
            style={{
              width: "100%",
              background: "#0d0f18",
              border: "1px solid #2d3148",
              borderRadius: 6,
              color: "#cbd5e1",
              padding: "8px 10px",
              fontSize: 13,
              fontFamily: "monospace",
              resize: "vertical"
            }}
          />
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            Add known paths that the crawler might miss — useful for SPAs with JavaScript-driven navigation.
          </p>
        </div>

        <div className="field-group">
          <label>Authentication</label>
          <select
            value={authType}
            onChange={(e) => setField("auth.type", e.target.value)}
            disabled={status === "crawling"}
          >
            <option value="none">None (public site)</option>
            <option value="form">Form login</option>
            <option value="bearer">Bearer token</option>
            <option value="cookie">Session cookie</option>
          </select>
        </div>

        {authType === "form" && (
          <div className="auth-fields">
            <div className="field-group">
              <label>Login URL</label>
              <input
                type="text"
                value={form.auth.loginURL}
                onChange={(e) => setField("auth.loginURL", e.target.value)}
                disabled={status === "crawling"}
              />
            </div>
            <div className="field-row">
              <div className="field-group">
                <label>Username selector</label>
                <input
                  type="text"
                  value={form.auth.usernameSelector}
                  onChange={(e) => setField("auth.usernameSelector", e.target.value)}
                  disabled={status === "crawling"}
                />
              </div>
              <div className="field-group">
                <label>Password selector</label>
                <input
                  type="text"
                  value={form.auth.passwordSelector}
                  onChange={(e) => setField("auth.passwordSelector", e.target.value)}
                  disabled={status === "crawling"}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field-group">
                <label>Username</label>
                <input
                  type="text"
                  value={form.auth.username}
                  onChange={(e) => setField("auth.username", e.target.value)}
                  disabled={status === "crawling"}
                />
              </div>
              <div className="field-group">
                <label>Password</label>
                <input
                  type="password"
                  value={form.auth.password}
                  onChange={(e) => setField("auth.password", e.target.value)}
                  disabled={status === "crawling"}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field-group">
                <label>Submit button selector</label>
                <input
                  type="text"
                  value={form.auth.submitSelector}
                  onChange={(e) => setField("auth.submitSelector", e.target.value)}
                  disabled={status === "crawling"}
                />
              </div>
              <div className="field-group">
                <label>Success URL contains</label>
                <input
                  type="text"
                  value={form.auth.successURLContains}
                  onChange={(e) => setField("auth.successURLContains", e.target.value)}
                  disabled={status === "crawling"}
                />
              </div>
            </div>
          </div>
        )}

        {authType === "bearer" && (
          <div className="auth-fields">
            <div className="field-group">
              <label>Bearer Token</label>
              <input
                type="password"
                placeholder="eyJhbGci..."
                value={form.auth.bearerToken}
                onChange={(e) => setField("auth.bearerToken", e.target.value)}
                disabled={status === "crawling"}
              />
            </div>
          </div>
        )}

        {authType === "cookie" && (
          <div className="auth-fields">
            <div className="field-row">
              <div className="field-group">
                <label>Cookie name</label>
                <input
                  type="text"
                  value={form.auth.cookieName}
                  onChange={(e) => setField("auth.cookieName", e.target.value)}
                  disabled={status === "crawling"}
                />
              </div>
              <div className="field-group">
                <label>Cookie value</label>
                <input
                  type="password"
                  value={form.auth.cookieValue}
                  onChange={(e) => setField("auth.cookieValue", e.target.value)}
                  disabled={status === "crawling"}
                />
              </div>
            </div>
            <div className="field-group">
              <label>Domain (leave blank to auto-detect)</label>
              <input
                type="text"
                placeholder="localhost"
                value={form.auth.cookieDomain}
                onChange={(e) => setField("auth.cookieDomain", e.target.value)}
                disabled={status === "crawling"}
              />
            </div>
          </div>
        )}

        <button
          className={`crawl-btn ${status === "crawling" ? "crawling" : ""}`}
          onClick={startCrawl}
          disabled={status === "crawling"}
        >
          {status === "crawling" ? "Crawling..." : "Start Crawl"}
        </button>
      </div>

      <div className="configure-right">
        <div className="log-header">
          <h2 className="section-title">Progress</h2>
          {status !== "idle" && (
            <span className={`status-badge ${status}`}>
              {status === "crawling" && "● Crawling"}
              {status === "done" && "Done"}
              {status === "error" && "Error"}
            </span>
          )}
        </div>

        <div className="log-feed">
          {logs.length === 0 && status === "idle" && (
            <p className="log-empty">Configure a URL and click "Start Crawl" to begin.</p>
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
            Crawl complete — opening Site Map...
          </div>
        )}
      </div>
    </div>
  );
}