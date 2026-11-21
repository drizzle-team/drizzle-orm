// Temp: DateStyle pinning against live Neon (direct + -pooler; TCP, WebSocket, HTTP) on a throwaway
// database whose defaults are German / iso_8601.   NEON_URL='postgresql://…-pooler…/db13?…' bun tmp/neon-live-datestyle.ts
import { connect as tcp } from '../src/index.ts';
import { connect as http } from '../src/neon-http.ts';
import { connect as ws } from '../src/neon-ws.ts';

const pooled = new URL(process.env.NEON_URL!);
const direct = new URL(pooled);
direct.hostname = pooled.hostname.replace('-pooler.', '.');
const db = `tmp_datestyle_${process.pid}`;
const at = (u: URL) => {
	const x = new URL(u);
	x.pathname = `/${db}`;
	return x.toString();
};

const admin = await tcp(direct.toString());
await admin.query(`create database ${db}`);
await admin.query(`alter database ${db} set datestyle = 'German'`);
await admin.query(`alter database ${db} set intervalstyle = 'iso_8601'`);
const SQL =
	"select current_setting('datestyle') ds, current_setting('intervalstyle') iv, '2024-02-03 12:34:56.789+00'::timestamptz ts, interval '1 day 2 hours' i";
try {
	for (
		const [name, open] of [
			['tcp direct', () => tcp(at(direct))],
			['tcp pooler', () => tcp(at(pooled))],
			['ws direct', () => ws(at(direct))],
			['ws pooler', () => ws(at(pooled))],
			['http direct', () => http(at(direct))],
			['http pooler', () => http(at(pooled))],
		] as const
	) {
		let c:
			| { query(s: string, p?: unknown[], o?: object): Promise<{ rows: unknown[] }>; end(): Promise<void> }
			| undefined;
		try {
			c = (await open()) as unknown as typeof c;
			const r = await c!.query(SQL, [], { mode: 'object' });
			const row = r.rows[0] as { ds: string; iv: string; ts: Date; i: string };
			console.log(name.padEnd(12), 'ok   ', row.ds, '|', row.iv, '|', row.ts.toISOString(), '|', row.i);
		} catch (e) {
			console.log(name.padEnd(12), 'ERROR', (e as Error).message.slice(0, 110));
		} finally {
			await c?.end().catch(() => {});
		}
	}
} finally {
	await admin.query(`drop database if exists ${db} with (force)`);
	console.log('dropped', db, (await admin.query('select count(*) from pg_database where datname = $1', [db])).rows[0]);
	await admin.end();
}
