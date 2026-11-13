// Temp: does Neon's /sql endpoint honour `options` (-c DateStyle=ISO) in the Neon-Connection-String header?
import { connect as tcp } from '../src/index.ts';

const pooled = new URL(process.env.NEON_URL!);
const direct = new URL(pooled);
direct.hostname = pooled.hostname.replace('-pooler.', '.');
const db = `tmp_datestyle_${process.pid}`;
const admin = await tcp(direct.toString());
await admin.query(`create database ${db}`);
await admin.query(`alter database ${db} set datestyle = 'German'`);
await admin.query(`alter database ${db} set intervalstyle = 'iso_8601'`);
const query =
	"select current_setting('datestyle') ds, current_setting('intervalstyle') iv, '2024-02-03 12:34:56.789+00'::timestamptz::text ts";
const send = async (label: string, conn: string, extra: Record<string, string> = {}) => {
	const host = new URL(conn).hostname;
	const res = await fetch(`https://${host.replace(/^[^.]+/, 'api')}/sql`, {
		method: 'POST',
		headers: { 'Neon-Connection-String': conn, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'true', ...extra },
		body: JSON.stringify({ query, params: [] }),
	});
	const body = await res.json() as { rows?: unknown[]; message?: string };
	console.log(label.padEnd(34), res.status, JSON.stringify(body.rows?.[0] ?? body.message));
};
try {
	for (const [kind, base] of [['direct', direct], ['pooler', pooled]] as const) {
		const u = new URL(base);
		u.pathname = `/${db}`;
		await send(`${kind} plain`, u.toString());
		const o = new URL(u);
		o.searchParams.set('options', '-c DateStyle=ISO -c IntervalStyle=postgres');
		await send(`${kind} options (encoded)`, o.toString());
		await send(`${kind} options (raw)`, `${u}&options=-c%20DateStyle%3DISO`);
		await send(`${kind} Neon-Options header`, u.toString(), { 'Neon-Options': '-c DateStyle=ISO' });
		const f = new URL(u);
		f.searchParams.set('options', 'neon_proxy_params_compat:true -c DateStyle=ISO');
		await send(`${kind} compat flag + -c`, f.toString());
	}
} finally {
	await admin.query(`drop database if exists ${db} with (force)`);
	console.log('dropped', db, (await admin.query('select count(*) from pg_database where datname = $1', [db])).rows[0]);
	await admin.end();
}
