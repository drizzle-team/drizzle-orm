// Temp: what does the neon-http driver return for a timestamptz in raw/buffer mode?
//   NEON_HTTP_URL='postgres://postgres:postgres@db.localtest.me:54327/main' bun tmp/neon-tz-raw.ts
import { connect } from '../src/neon-http.ts';
import { neonHttpConfig } from '../test/helpers/neon.ts';

const url = process.env.NEON_HTTP_URL;
if (!url) throw new Error('set NEON_HTTP_URL');
const db = await connect(neonHttpConfig(url));
const sql = "select '2024-02-03 12:34:56.789+00'::timestamptz as tz";

const buffer = await db.query(sql, [], { mode: 'buffer' });
const cell = (buffer.rows[0] as Buffer[])[0]!;
console.log('buffer cell:', cell, JSON.stringify(cell.toString('latin1')), 'bytes', cell.length);

const raw = await db.query(sql, [], { mode: 'raw' });
console.log('raw DataRow:', raw.rows[0]);

const decoded = await db.query(sql, []);
const v = (decoded.rows[0] as unknown[])[0];
console.log('decoded:', v, typeof v, v?.constructor?.name);

// set local only lives inside a transaction, and over HTTP each query() is its own session,
// so both statements go in one transaction([...]) batch.
for (const mode of ['buffer', 'raw', 'array'] as const) {
	const [, r] = await db.transaction([{ sql: "set local datestyle = 'German'" }, { sql, mode }]);
	const row = r!.rows[0] as unknown;
	const c = mode === 'raw' ? row : (row as unknown[])[0];
	console.log(`German ${mode}:`, c, mode === 'buffer' ? JSON.stringify((c as Buffer).toString('latin1')) : '');
}
