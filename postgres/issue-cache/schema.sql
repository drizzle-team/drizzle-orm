-- Local PGlite cache schema for postgres.js + node-postgres issues & comments.
-- Safe to run repeatedly (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS issues (
  repo            text    NOT NULL,           -- 'postgres.js' | 'node-postgres'
  number          integer NOT NULL,
  title           text,
  body            text,
  state           text,                        -- 'open' | 'closed'
  created_at      timestamptz,
  closed_at       timestamptz,
  url             text,
  labels          jsonb   DEFAULT '[]'::jsonb,
  comments_count  integer DEFAULT 0,
  PRIMARY KEY (repo, number)
);
CREATE INDEX IF NOT EXISTS issues_state_idx ON issues(state);
CREATE INDEX IF NOT EXISTS issues_repo_idx  ON issues(repo);
-- Full-text search over title+body (expression GIN index, no generated column needed).
CREATE INDEX IF NOT EXISTS issues_fts_idx ON issues
  USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')));

CREATE TABLE IF NOT EXISTS comments (
  id             bigint  PRIMARY KEY,          -- GitHub comment id (globally unique)
  repo           text    NOT NULL,
  issue_number   integer NOT NULL,
  author         text,
  author_assoc   text,                          -- OWNER / MEMBER / CONTRIBUTOR / NONE ...
  body           text,
  created_at     timestamptz,
  updated_at     timestamptz,
  url            text
);
CREATE INDEX IF NOT EXISTS comments_issue_idx ON comments(repo, issue_number);
CREATE INDEX IF NOT EXISTS comments_fts_idx ON comments
  USING gin (to_tsvector('english', coalesce(body,'')));

-- Resumability marker: which issues have had their comment thread pulled.
CREATE TABLE IF NOT EXISTS comment_fetch_log (
  repo          text    NOT NULL,
  issue_number  integer NOT NULL,
  fetched_at    timestamptz DEFAULT now(),
  comment_count integer,
  PRIMARY KEY (repo, issue_number)
);

-- pgvector: semantic-search embeddings (384-dim, all-MiniLM-L6-v2). Added idempotently.
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE issues   ADD COLUMN IF NOT EXISTS embedding vector(384);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS embedding vector(384);
CREATE INDEX IF NOT EXISTS issues_embedding_idx   ON issues   USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS comments_embedding_idx ON comments USING hnsw (embedding vector_cosine_ops);

-- Convenience view: an issue with its comment thread count actually cached.
CREATE OR REPLACE VIEW issue_overview AS
  SELECT i.repo, i.number, i.state, i.title, i.comments_count AS gh_comments,
         count(c.id) AS cached_comments, i.url
  FROM issues i
  LEFT JOIN comments c ON c.repo = i.repo AND c.issue_number = i.number
  GROUP BY i.repo, i.number, i.state, i.title, i.comments_count, i.url;
