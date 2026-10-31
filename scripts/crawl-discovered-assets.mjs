#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "company-crawl-results.json");
const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const journalDir = process.env.ASSET_CRAWL_DIR || path.join(os.tmpdir(), "company-asset-crawl");
await fs.mkdir(journalDir, { recursive: true });
const timeoutMs = Number(process.env.CRAWL_TIMEOUT_MS || 9000);
const concurrency = Math.max(1, Math.min(24, Number(process.env.CRAWL_CONCURRENCY || 16)));
const hostGapMs = Math.max(0, Number(process.env.CRAWL_HOST_GAP_MS || 200));
const date = new Date().toISOString().slice(0, 10);

function unique(values) { return [...new Set(values)]; }
const jobUrls = unique(Object.values(source.completed).flatMap(company => (company.jobs || []).map(job => job.url).filter(Boolean)));
const imageUrls = unique(Object.values(source.completed).flatMap(company => company.images || []));
const hostTimes = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fetchResource(url, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const host = new URL(url).host;
    const wait = Math.max(0, (hostTimes.get(host) || 0) - Date.now());
    if (wait) await delay(wait);
    hostTimes.set(host, Date.now() + hostGapMs);
    const response = await fetch(url, { method, redirect: "follow", signal: controller.signal, headers: { "user-agent": "CompanyDirectoryResearchBot/1.0 (+public career-page indexing)", accept: method === "HEAD" ? "image/avif,image/webp,image/*,*/*;q=0.5" : "text/html,application/xhtml+xml" } });
    const result = { url, finalUrl: response.url, status: response.status, contentType: response.headers.get("content-type") || "", contentLength: Number(response.headers.get("content-length")) || null, checkedOn: date };
    if (method === "GET" && /html|xhtml/i.test(result.contentType)) {
      const html = (await response.text()).slice(0, 2_000_000);
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const description = html.match(/<meta\s+[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["']/i)?.[1];
      result.title = title?.slice(0, 300) || null;
      result.description = description?.replace(/\s+/g, " ").slice(0, 700) || null;
      result.jobPageEvidence = /\b(job description|responsibilities|qualifications|apply now|submit application|job overview|position summary)\b/i.test(html);
    }
    return result;
  } catch (error) {
    return { url, error: error.name === "AbortError" ? "timeout" : String(error.message || error).slice(0, 250), checkedOn: date };
  } finally { clearTimeout(timer); }
}

async function runStage(name, urls, method) {
  const file = path.join(journalDir, `${name}.jsonl`);
  let done = new Set();
  try {
    const old = await fs.readFile(file, "utf8");
    for (const line of old.split("\n")) if (line) try { done.add(JSON.parse(line).url); } catch {}
  } catch {}
  const pending = urls.filter(url => !done.has(url));
  let cursor = 0;
  let finished = 0;
  let buffer = [];
  let appendQueue = Promise.resolve();
  const checkpoint = async force => {
    if (!buffer.length || (!force && buffer.length < 50)) return;
    const lines = buffer.splice(0).map(row => JSON.stringify(row)).join("\n") + "\n";
    appendQueue = appendQueue.then(() => fs.appendFile(file, lines));
    await appendQueue;
    process.stdout.write(`${name}: ${done.size + finished}/${urls.length}\n`);
  };
  async function worker() {
    while (cursor < pending.length) {
      const url = pending[cursor++];
      const result = await fetchResource(url, method);
      buffer.push(result); finished++;
      await checkpoint(false);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  await checkpoint(true);
  return { file, completed: done.size + finished, total: urls.length };
}

console.log(`Found ${jobUrls.length} unique discovered job links and ${imageUrls.length} unique image URLs.`);
const jobs = await runStage("jobs", jobUrls, "GET");
const images = await runStage("images", imageUrls, "HEAD");
console.log(JSON.stringify({ checkedOn: date, jobs, images, journalDir }, null, 2));
