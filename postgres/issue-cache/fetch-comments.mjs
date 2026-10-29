// Fetch GitHub issue comments into the PGlite cache. Resumable & idempotent:
// skips issues already in comment_fetch_log, upserts comments by id.
import { execSync } from 'node:child_process'
import { openDb, REPO_API, tolerantParse } from './lib.mjs'

const CONCURRENCY = Number(process.env.CONCURRENCY || 6)
const token = (process.env.GITHUB_TOKEN || execSync('gh auth token').toString()).trim()
const HEADERS = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'issue-cache',
}

const db = await openDb()

const { rows: pending } = await db.query(`
  SELECT i.repo, i.number, i.comments_count
  FROM issues i
  WHERE i.comments_count > 0
    AND NOT EXISTS (SELECT 1 FROM comment_fetch_log l WHERE l.repo=i.repo AND l.issue_number=i.number)
  ORDER BY i.repo, i.number`)

console.log(`Pending issues to fetch comments for: ${pending.length} (concurrency=${CONCURRENCY})`)
if (pending.length === 0) process.exit(0)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ghGet(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: HEADERS })
    if (res.status === 200) return res
    const remaining = res.headers.get('x-ratelimit-remaining')
    if ((res.status === 403 || res.status === 429) && remaining === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000
      const wait = Math.max(1000, reset - Date.now() + 1000)
      console.log(`Rate limited; sleeping ${Math.round(wait / 1000)}s...`)
      await sleep(wait)
      continue
    }
    if (res.status >= 500 || res.status === 403 || res.status === 429) {
      await sleep(1000 * 2 ** attempt) // backoff for transient / secondary limits
      continue
    }
    throw new Error(`GET ${url} -> ${res.status} ${await res.text()}`)
  }
  throw new Error(`GET ${url} failed after retries`)
}

async function fetchIssueComments(repo, number) {
  const api = REPO_API[repo]
  const out = []
  for (let page = 1; ; page++) {
    const res = await ghGet(`https://api.github.com/repos/${api}/issues/${number}/comments?per_page=100&page=${page}`)
    const arr = tolerantParse(await res.text())
    for (const c of arr) {
      out.push({
        id: c.id, repo, issue_number: number,
        author: c.user ? c.user.login : null,
        author_assoc: c.author_association || null,
        body: c.body || '',
        created_at: c.created_at || null, updated_at: c.updated_at || null,
        url: c.html_url || null,
      })
    }
    if (arr.length < 100) break
  }
  return out
}

async function persist(repo, number, comments) {
  if (comments.length) {
    const COLS = ['id', 'repo', 'issue_number', 'author', 'author_assoc', 'body', 'created_at', 'updated_at', 'url']
    const CAST = { created_at: '::timestamptz', updated_at: '::timestamptz' }
    const params = []
    const tuples = comments.map((c, r) =>
      `(${COLS.map((col, ci) => { params.push(c[col]); return `$${r * COLS.length + ci + 1}${CAST[col] || ''}` }).join(',')})`)
    await db.query(
      `INSERT INTO comments (${COLS.join(',')}) VALUES ${tuples.join(',')} ON CONFLICT (id) DO NOTHING`, params)
  }
  await db.query(
    `INSERT INTO comment_fetch_log (repo, issue_number, comment_count) VALUES ($1,$2,$3)
     ON CONFLICT (repo, issue_number) DO UPDATE SET fetched_at=now(), comment_count=EXCLUDED.comment_count`,
    [repo, number, comments.length])
}

let done = 0, totalComments = 0, failed = 0
const t0 = Date.now()
async function worker(slice) {
  for (const it of slice) {
    try {
      const comments = await fetchIssueComments(it.repo, it.number)
      await persist(it.repo, it.number, comments)
      totalComments += comments.length
    } catch (e) {
      failed++
      console.error(`FAIL ${it.repo}#${it.number}: ${e.message.slice(0, 200)}`)
    }
    done++
    if (done % 100 === 0) {
      const rate = done / ((Date.now() - t0) / 1000)
      console.log(`${done}/${pending.length} issues | ${totalComments} comments | ${rate.toFixed(1)}/s | failed=${failed}`)
    }
  }
}

// round-robin partition so both repos progress together
const partitions = Array.from({ length: CONCURRENCY }, () => [])
pending.forEach((it, i) => partitions[i % CONCURRENCY].push(it))
await Promise.all(partitions.map(worker))

const { rows } = await db.query(`SELECT repo, count(*)::int AS cached_comments FROM comments GROUP BY repo ORDER BY repo`)
console.log(`\nDONE. ${done} issues processed, ${totalComments} comments fetched, ${failed} failed, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
console.table(rows)
await db.close() // flush PGlite writes to disk before exit (do NOT process.exit before this)
