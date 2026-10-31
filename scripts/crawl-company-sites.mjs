#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "lib", "comp", "data");
const output = process.env.CRAWL_OUTPUT || path.join(root, "company-crawl-results.json");
let saveQueue = Promise.resolve();
const saveResults = value => {
  saveQueue = saveQueue.then(async () => {
    const temp = `${output}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(value, null, 2));
    await fs.rename(temp, output);
  });
  return saveQueue;
};
const today = new Date().toISOString().slice(0, 10);
const timeoutMs = Number(process.env.CRAWL_TIMEOUT_MS || 12000);
const concurrency = Math.max(1, Math.min(8, Number(process.env.CRAWL_CONCURRENCY || 4)));
const pauseMs = Math.max(0, Number(process.env.CRAWL_PAUSE_MS || 400));

const readJson = async name => JSON.parse(await fs.readFile(path.join(dataDir, name), "utf8"));
const inputs = await Promise.all(["companies.json", "expanded-companies.json", "additional-companies.json"].map(readJson));
const companyMap = new Map();
for (const company of inputs.flat()) {
  const domain = (() => { try { return new URL(company.website).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } })();
  const key = domain || company.key || company.name;
  if (!companyMap.has(key)) companyMap.set(key, { ...company, names: [...(company.names || []), company.name], jobs: [...(company.jobs || [])] });
  else {
    const current = companyMap.get(key);
    current.names = [...new Set([...current.names, ...(company.names || []), company.name])];
    current.jobs.push(...(company.jobs || []));
    current.careersUrl ||= company.careersUrl;
  }
}
const nearshore = await readJson("nearshore.json");
for (const entry of nearshore) {
  const domain = (() => { try { return new URL(entry.website).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } })();
  const current = companyMap.get(domain);
  if (current) current.careersUrl ||= entry.careersUrl;
  else companyMap.set(domain || entry.key, { key: entry.key, name: entry.name, names: [entry.name], website: entry.website, careersUrl: entry.careersUrl, jobs: [] });
}
const companies = [...companyMap.values()];
let saved = { checkedOn: today, totalCompanies: companies.length, completed: {}, summary: {} };
try { saved = { ...saved, ...JSON.parse(await fs.readFile(output, "utf8")) }; } catch {}
// Use the official-site host as the checkpoint key. Legacy keys can collide across employers.
saved.completed = Object.fromEntries(Object.values(saved.completed || {}).map(record => {
  const host = (() => { try { return new URL(record.website).hostname.replace(/^www\./, "").toLowerCase(); } catch { return record.key; } })();
  return [host, record];
}));

const decode = s => s.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m => [m[1].toLowerCase(), decode(m[2] ?? m[3] ?? m[4] ?? "")]));
function extract(html, pageUrl) {
  const images = new Set();
  const jobs = new Map();
  for (const match of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    const src = a.src || a["data-src"] || a.srcset?.split(",")[0]?.trim().split(/\s+/)[0];
    if (src) try { images.add(new URL(src, pageUrl).href); } catch {}
  }
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (/og:image|twitter:image|^logo$/i.test(a.property || a.name || a.itemprop || "") && a.content) try { images.add(new URL(a.content, pageUrl).href); } catch {}
  }
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const a = attrs(match[0].slice(0, match[0].indexOf(">") + 1));
    if (!a.href) continue;
    const label = decode(match[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (/job|career|position|opening|vacanc|opportunit|apply|requisition/i.test(`${a.href} ${label}`)) {
      try { const url = new URL(a.href, pageUrl); if (/^https?:$/.test(url.protocol)) jobs.set(url.href, label.slice(0, 240)); } catch {}
    }
  }
  return { images: [...images], jobs: [...jobs].map(([url, title]) => ({ url, title })) };
}
async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "CompanyDirectoryResearchBot/1.0 (+public career-page indexing)", accept: "text/html,application/xhtml+xml" } });
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("xhtml")) return { requestedUrl: url, finalUrl: response.url, status: response.status, contentType: type, error: type ? "non-html" : undefined };
    const html = (await response.text()).slice(0, 5_000_000);
    return { requestedUrl: url, finalUrl: response.url, status: response.status, contentType: type, ...extract(html, response.url) };
  } catch (error) { return { requestedUrl: url, error: error.name === "AbortError" ? "timeout" : String(error.message || error).slice(0, 300) }; }
  finally { clearTimeout(timer); }
}
const crawlKey = c => { try { return new URL(c.website).hostname.replace(/^www\./, "").toLowerCase(); } catch { return c.key || c.name; } };
const queue = companies.filter(c => !saved.completed[crawlKey(c)]);
let cursor = 0;
async function worker() {
  while (cursor < queue.length) {
    const company = queue[cursor++];
    const key = crawlKey(company);
    const targets = [...new Set([company.website, company.careersUrl, ...(company.jobs || []).map(j => j.url)].filter(Boolean))];
    const pages = [];
    for (const url of targets) {
      let parsed; try { parsed = new URL(url); } catch { continue; }
      if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) continue;
      pages.push(await fetchPage(url));
      if (pauseMs) await new Promise(resolve => setTimeout(resolve, pauseMs));
    }
    const careersCandidates = new Set();
    const imageUrls = new Set();
    const discoveredJobs = new Map((company.jobs || []).map(job => [job.url, { url: job.url, title: job.title, location: job.location, source: "catalog" }]));
    for (const page of pages) {
      for (const item of page.images || []) imageUrls.add(item);
      for (const item of page.jobs || []) discoveredJobs.set(item.url, { ...item, source: page.finalUrl });
      if (!company.careersUrl && page.finalUrl) for (const item of page.jobs || []) if (/career|job|opening|position/i.test(item.url)) careersCandidates.add(item.url);
    }
    saved.completed[key] = { key, name: company.name, website: company.website || null, careersUrl: company.careersUrl || null, careersCandidates: [...careersCandidates], pages, jobs: [...discoveredJobs.values()], images: [...imageUrls], checkedOn: today };
    if (cursor % 10 === 0 || cursor === queue.length) {
      const done = Object.values(saved.completed);
      saved.summary = { completedCompanies: done.length, totalCompanies: companies.length, pagesFetched: done.reduce((n, c) => n + c.pages.length, 0), jobsFound: done.reduce((n, c) => n + c.jobs.length, 0), imageUrlsFound: done.reduce((n, c) => n + c.images.length, 0), checkedOn: today };
      await saveResults(saved);
      process.stdout.write(`${saved.summary.completedCompanies}/${companies.length} companies; ${saved.summary.pagesFetched} pages; ${saved.summary.jobsFound} jobs; ${saved.summary.imageUrlsFound} images\n`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
await saveResults(saved);
console.log(`Crawl finished. Results: ${output}`);
