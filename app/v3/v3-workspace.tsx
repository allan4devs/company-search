"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Circle, Database, Layers3, LoaderCircle, Search, ShieldCheck, Sparkles } from "lucide-react";
import styles from "./v3.module.css";

type Company = {
  name?: string;
  website?: string;
  careersUrl?: string;
  locations?: string[];
  tracks?: string[];
  fit?: { status?: string; reasons?: string[] };
  sourceEvidence?: { kind?: string; url?: string; checkedOn?: string }[];
};

type DiscoveryRun = {
  id: string;
  cohort: string;
  status: "running" | "complete" | "error";
  startedAt: string;
  finishedAt?: string;
  stage: string;
  error?: string;
  company?: Company | null;
  report?: Record<string, unknown> | null;
  log: string[];
};

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export default function V3Workspace() {
  const [run, setRun] = useState<DiscoveryRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [catalogTotal, setCatalogTotal] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/comp/v3/discover", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/comp/catalog?group=companies&tab=all&page=1&pageSize=12&fastPageOnly=true", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([discovery, catalog]) => {
      if (!active) return;
      setRun(discovery.run || null);
      setCatalogTotal(typeof catalog.total === "number" ? catalog.total : null);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const runningRunId = run?.status === "running" ? run.id : null;

  useEffect(() => {
    if (!runningRunId) return;
    let active = true;
    const timer = window.setInterval(() => {
      void fetch(`/api/comp/v3/discover?id=${encodeURIComponent(runningRunId)}`, { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => { if (active && data.run) setRun(data.run); })
        .catch(() => undefined);
    }, 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, [runningRunId]);

  async function startDiscovery() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/comp/v3/discover", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo iniciar la búsqueda.");
      setRun(data.run);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo iniciar la búsqueda.");
    } finally {
      setBusy(false);
    }
  }

  const report = run?.report || {};
  const rawCount = asNumber(report.rawLeadCount);
  const verifiedCount = asNumber(report.verifiedDomainUniqueCompanies);
  const completedSources = Array.isArray(report.sourceDurations)
    ? report.sourceDurations.filter((source) => source && typeof source === "object" && (source as { ok?: unknown }).ok === true).length
    : 14;
  const laneCount = report.laneLeadCounts && typeof report.laneLeadCounts === "object"
    ? Object.keys(report.laneLeadCounts).length
    : 14;
  const isRunning = run?.status === "running";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="The Comp home">
          <span className={styles.brandMark}>c</span>
          <span>the comp</span>
          <span className={styles.version}>V3</span>
        </Link>
        <div className={styles.topRight}>
          <span className={styles.local}><span /> Local workspace</span>
          <Link className={styles.backLink} href="/">Classic view <ArrowUpRight size={14} /></Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.eyebrow}><Sparkles size={14} /> COMPANY DISCOVERY</div>
        <h1>Find the next<br /><em>right</em> company.</h1>
        <p className={styles.intro}>One verified employer at a time. The Comp checks a broad source pool, removes catalog matches, then verifies first-party evidence.</p>
      </section>

      <section className={styles.workspace}>
        <div className={styles.leftColumn}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.label}>DISCOVERY RUN</div>
              <h2>One new company</h2>
            </div>
            <span className={styles.targetPill}>Target <b>01</b></span>
          </div>

          <div className={styles.criteria}>
            <div className={styles.criteriaIcon}><Search size={16} /></div>
            <div><span>Company fit</span><strong>Software engineering · Costa Rica / LATAM</strong></div>
            <Check className={styles.criterionCheck} size={16} />
          </div>

          <div className={styles.metrics}>
            <div className={styles.metric}><span>Exploration cap</span><strong>10,000</strong><small>unique company leads</small></div>
            <div className={styles.metric}><span>Source fetchers</span><strong>{completedSources}</strong><small>public lead sources</small></div>
            <div className={styles.metric}><span>Review slices</span><strong>200</strong><small>per verification pass</small></div>
          </div>

          <div className={styles.explain}>
            <div className={styles.explainIcon}><Layers3 size={16} /></div>
            <p><b>Beyond the first 200.</b> Results are interleaved across source lanes, deduped against one Mongo snapshot, then verified in 200-company slices. The search advances to the next slice until one passes or the source pool ends.</p>
          </div>

          <button className={styles.runButton} type="button" onClick={startDiscovery} disabled={busy || isRunning}>
            {busy || isRunning ? <LoaderCircle className={styles.spin} size={17} /> : <Search size={17} />}
            {isRunning ? "Searching sources…" : busy ? "Starting…" : run?.status === "complete" ? "Run again" : "Find 1 new company"}
            {!busy && !isRunning && <span>↗</span>}
          </button>
          <div className={styles.privacy}><Database size={13} /> Reads Mongo for dedupe · creates a local review batch · never imports</div>
          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.rightColumn}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.label}>LIVE STATUS</div>
              <h2>{isRunning ? "Working through the pool" : run?.status === "complete" ? "Latest result" : "Ready to search"}</h2>
            </div>
            <span className={`${styles.statusPill} ${isRunning ? styles.statusWorking : run?.status === "error" ? styles.statusError : styles.statusReady}`}>
              <span /> {isRunning ? "In progress" : run?.status === "error" ? "Needs attention" : run?.status === "complete" ? "Complete" : "Ready"}
            </span>
          </div>

          {run ? (
            <>
              <div className={styles.progressCard}>
                <div className={styles.progressTop}><span>{run.stage}</span><span>{run.status === "running" ? "LIVE" : run.status.toUpperCase()}</span></div>
                <div className={styles.progressTrack}><div className={isRunning ? styles.progressActive : run.status === "complete" ? styles.progressDone : styles.progressFailed} /></div>
                <div className={styles.statsRow}>
                  <div><b>{rawCount.toLocaleString()}</b><span>raw leads</span></div>
                  <div><b>{laneCount || completedSources}</b><span>search partitions</span></div>
                  <div><b>{verifiedCount}</b><span>verified + unique</span></div>
                </div>
              </div>

              {run.company ? <CompanyResult company={run.company} checkedOn={run.finishedAt || run.startedAt} /> : run.status === "complete" ? (
                <div className={styles.emptyResult}>
                  <ShieldCheck size={18} />
                  <div><b>No company passed all checks.</b><span>Review the source report and widen or change the source lanes.</span></div>
                </div>
              ) : run.status === "error" ? (
                <div className={styles.emptyResult}><Circle size={17} /><div><b>Run stopped.</b><span>{run.error || "Open the local run output for details."}</span></div></div>
              ) : (
                <div className={styles.logBox}>
                  {run.log.slice(-5).map((line, index) => <div key={`${index}-${line}`}><span className={index === run.log.length - 1 ? styles.logDotLive : styles.logDot} />{line}</div>)}
                  {run.log.length === 0 && <div><span className={styles.logDotLive} />Connecting to the source pool…</div>}
                </div>
              )}
            </>
          ) : (
            <div className={styles.placeholder}>
              <div className={styles.placeholderIcon}><Search size={22} /></div>
              <b>Your next verified company appears here.</b>
              <span>Official identity, regional evidence, and a catalog dedupe come first.</span>
            </div>
          )}

          <div className={styles.catalogStatus}>
            <span><span className={styles.liveDot} /> Mongo catalog</span>
            <b>{catalogTotal === null ? "Checking" : `${catalogTotal.toLocaleString()} companies`}</b>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>THE COMP · V3</span>
        <span>Evidence first. One employer at a time.</span>
      </footer>
    </main>
  );
}

function CompanyResult({ company, checkedOn }: { company: Company; checkedOn: string }) {
  const checkedDate = new Date(checkedOn).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "2-digit" });
  const evidence = (company.sourceEvidence || []).filter((item) => item.url).slice(0, 3);
  return (
    <article className={styles.companyCard}>
      <div className={styles.companyTop}>
        <span className={styles.companyIcon}>{company.name?.slice(0, 1) || "C"}</span>
        <div className={styles.companyTitle}><h3>{company.name}</h3><span>{company.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") || "Official website verified"}</span></div>
        <span className={styles.newBadge}><Check size={12} /> NEW</span>
      </div>
      <div className={styles.companyTags}>
        {(company.locations || ["Costa Rica / LATAM"]).slice(0, 2).map((location) => <span key={location}>{location}</span>)}
        {(company.tracks || []).slice(0, 2).map((track) => <span key={track}>{track}</span>)}
      </div>
      <div className={styles.evidenceHead}><ShieldCheck size={14} /> VERIFIED EVIDENCE <span>{checkedDate}</span></div>
      <div className={styles.evidenceLinks}>
        {evidence.map((item, index) => <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer">{item.kind || "Source"}<ArrowUpRight size={12} /></a>)}
        {company.website && !evidence.some((item) => item.url === company.website) && <a href={company.website} target="_blank" rel="noreferrer">Official site<ArrowUpRight size={12} /></a>}
      </div>
      {company.fit?.reasons?.[0] && <p className={styles.reason}>{company.fit.reasons[0]}</p>}
    </article>
  );
}
