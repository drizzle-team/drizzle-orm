import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite/vector'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const HERE = dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = join(HERE, '.pgdata')

export const REPO_API = {
  'postgres.js': 'porsager/postgres',
  'node-postgres': 'brianc/node-postgres',
}

let _db = null
export async function openDb() {
  if (_db) return _db
  _db = new PGlite(DATA_DIR, { extensions: { vector } })
  await _db.exec(readFileSync(join(HERE, 'schema.sql'), 'utf8'))
  return _db
}

// GitHub occasionally emits invalid JSON backslash-escapes inside issue/comment
// bodies, which breaks JSON.parse. Repair stray escapes (consume backslash+char
// atomically so legit \\ pairs survive), then parse.
export function tolerantParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    const fixed = text.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt]|.)/gs, (m, g) => {
      const c = g[0]
      if (c === 'u' || '"\\/bfnrt'.includes(c)) return m
      return '\\\\' + g
    })
    return JSON.parse(fixed)
  }
}
