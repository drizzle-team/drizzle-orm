# issue-cache

A local **PGlite** (embedded Postgres, WASM) cache of every issue and comment from
[`porsager/postgres`](https://github.com/porsager/postgres) (postgres.js) and
[`brianc/node-postgres`](https://github.com/brianc/node-postgres) (`pg`).

Used as the source corpus for building the new driver's regression test suite
(see `../ISSUE_CLUSTERS_AND_TEST_SUITE.md`).

## Setup

```bash
cd issue-cache
npm install                 # installs @electric-sql/pglite
node load-issues.mjs        # load 3,258 issues from corpus.json into .pgdata/
node fetch-comments.mjs     # pull ~13k comments (resumable; needs `gh auth`)
```

The database persists to `./.pgdata/` (gitignored). All loaders are idempotent.

## Querying (keyword / SQL)

```bash
node q.mjs "SELECT repo, count(*) FROM issues GROUP BY repo"
node q.mjs "SELECT repo, number, title FROM issues
            WHERE to_tsvector('english', title||' '||body) @@ plainto_tsquery('reconnect ECONNRESET') LIMIT 20"
node q.mjs "SELECT * FROM issue_overview WHERE cached_comments <> gh_comments LIMIT 20"
```

## Semantic search (pgvector + local embeddings)

Embeddings use `all-MiniLM-L6-v2` (384-dim, runs locally via `@huggingface/transformers`, no API key)
stored in `vector(384)` columns with HNSW cosine indexes.

```bash
node embed.mjs issues       # embed issues   (resumable; ~2 min)
node embed.mjs comments     # embed comments (resumable; ~9 min)
node embed.mjs all          # both

node search.mjs "connection dies and pending queries hang forever"
node search.mjs --comments --limit 15 "prepared statement already exists"
node search.mjs --all --repo postgres.js "bigint parsed as string"
```

## Schema

- **issues** `(repo, number)` PK — title, body, state, timestamps, url, labels (jsonb), comments_count. GIN FTS index on title+body.
- **comments** `id` PK — repo, issue_number, author, author_assoc, body, timestamps, url. GIN FTS index on body.
- **comment_fetch_log** `(repo, issue_number)` — resumability marker for the comment fetcher.
- **issue_overview** view — issue + cached-vs-reported comment counts.

`corpus.json` is the raw merged issue dump (regenerable; gitignored).
