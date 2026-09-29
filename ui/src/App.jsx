// ui/src/App.jsx
import { useState } from "react";
import Configure from "./pages/Configure.jsx";
import SiteMap from "./pages/SiteMap.jsx";
import Generator from "./pages/Generator.jsx";
import Runner from "./pages/Runner.jsx";
import Fuzzer from "./pages/Fuzzer.jsx";
import "./App.css";

export default function App() {
  const [page, setPage] = useState("configure");
  const [crawlDone, setCrawlDone] = useState(false);
  const [generateDone, setGenerateDone] = useState(false);

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <span className="logo">Frontend Test Agent</span>
          <nav>
            <button
              className={`nav-btn ${page === "configure" ? "active" : ""}`}
              onClick={() => setPage("configure")}
            >
              Configure
            </button>
            <button
              className={`nav-btn ${page === "sitemap" ? "active" : ""}`}
              onClick={() => setPage("sitemap")}
              disabled={!crawlDone}
              title={!crawlDone ? "Run a crawl first" : ""}
            >
              Site Map
            </button>
            <button
              className={`nav-btn ${page === "generator" ? "active" : ""}`}
              onClick={() => setPage("generator")}
              disabled={!crawlDone}
              title={!crawlDone ? "Run a crawl first" : ""}
            >
              Generator
            </button>
            <button
              className={`nav-btn ${page === "runner" ? "active" : ""}`}
              onClick={() => setPage("runner")}
              disabled={!generateDone}
              title={!generateDone ? "Run the generator first" : ""}
            >
              Runner
            </button>
            <button
              className={`nav-btn ${page === "fuzzer" ? "active" : ""}`}
              onClick={() => setPage("fuzzer")}
            >
              Fuzzer
            </button>
          </nav>
        </div>
      </header>

      <main className="main">
        {page === "configure" && (
          <Configure
            onCrawlDone={() => {
              setCrawlDone(true);
              setPage("sitemap");
            }}
          />
        )}
        {page === "sitemap" && (
          <SiteMap onGoToGenerator={() => setPage("generator")} />
        )}
        {page === "generator" && (
          <Generator onGenerateDone={() => setGenerateDone(true)} />
        )}
        {page === "runner" && <Runner />}
        {page === "fuzzer" && <Fuzzer />}
      </main>
    </div>
  );
}