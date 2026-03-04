import { setTimeout as delay } from 'node:timers/promises';

const PS_API = 'https://api.planetscale.com/v1';
const ORG = 'drizzle-team';
const DB = 'pathtrami';
const TOKEN = process.env['PS_TOKEN']!; // service token or OAuth bearer

console.log(TOKEN);

type BranchOpts = {
	name?: string;
	parentBranch?: string; // usually "main"
	region?: string; // optional; defaults to DB's default region
	// For Data Branching® (clone schema+data) use one of:
	backupId?: string; // create from a specific backup
	restorePoint?: string; // RFC3339 timestamp
};

async function ps<T = any>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${PS_API}${path}`, {
		...init,
		headers: {
			Authorization: TOKEN,
			'Content-Type': 'application/json',
			...init?.headers,
		},
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`[${res.status}] ${res.statusText} — ${body}`);
	}
	return res.json() as Promise<T>;
}

export async function createBranch(opts: BranchOpts = {}) {
	const name = opts.name ?? `test_${Date.now().toString(36)}`;
	const result = await ps(
		`/organizations/${ORG}/databases/${DB}/branches`,
		{
			method: 'POST',
			body: JSON.stringify({
				name,
				parent_branch: opts.parentBranch ?? 'main',
				region: opts.region,
				backup_id: opts.backupId,
				restore_point: opts.restorePoint,
			}),
		},
	);

	console.time();
	for (let i = 0; i < 60; i++) {
		const b = await ps<{ state: string }>(
			`/organizations/${ORG}/databases/${DB}/branches/${name}`,
		);
		if (b.state?.toLowerCase() === 'ready') break;
		await delay(1000); // ~1–7s total typical
	}
	console.timeEnd();

	return result;
}

export async function createEphemeralPassword(branch: string, ttlSeconds = 3600) {
	// role: "writer" for tests that need DDL/DML; "reader" routes to replicas
	const p = await ps<{
		username: string;
		plaintext: string;
		access_host_url: string;
	}>(
		`/organizations/${ORG}/databases/${DB}/branches/${branch}/passwords`,
		{
			method: 'POST',
			body: JSON.stringify({
				name: `pw_${branch}`,
				role: 'writer',
				ttl: ttlSeconds, // auto-expires to reduce cleanup needs
				replica: false,
			}),
		},
	);

	// Build a standard MySQL connection URL
	const url = `mysql://${encodeURIComponent(p.username)}:${
		encodeURIComponent(
			p.plaintext,
		)
	}@${p.access_host_url}/?ssl={"rejectUnauthorized":true}`;
	return { ...p, url };
}

export async function deleteBranch(branch: string) {
	await ps(
		`/organizations/${ORG}/databases/${DB}/branches/${branch}`,
		{ method: 'DELETE' },
	);
}

export async function listBranches() {
	await ps(
		`/organizations/${ORG}/databases/${DB}/branches/`,
		{ method: 'GET' },
	);
}
