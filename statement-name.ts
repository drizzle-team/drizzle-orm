import { createHash } from 'crypto';

const iterations = 1_000_000;
const sql = 'SELECT id, name, email, created_at FROM users WHERE id = $1 AND status = $2';
const types = [23, 25];

// 1. SHA256 hash
function hashSha256(sql: string): string {
	return createHash('sha256').update(sql).digest('hex').slice(0, 16);
}

// 2. MD5 hash
function hashMd5(sql: string): string {
	return createHash('md5').update(sql).digest('hex');
}

// 3. postgres.js style (types + sql concatenation, used as key directly)
function postgresStyle(sql: string, types: number[]): string {
	return types.join(',') + sql;
}

// 4. Simple string as-is (no transform)
function noTransform(sql: string): string {
	return sql;
}

// Benchmark function
function bench(name: string, fn: () => string) {
	const start = performance.now();
	let result: string;
	for (let i = 0; i < iterations; i++) {
		result = fn();
	}
	const elapsed = performance.now() - start;
	console.log(
		`${name.padEnd(25)} ${elapsed.toFixed(2).padStart(8)}ms  (${
			(iterations / elapsed * 1000).toFixed(0).padStart(10)
		} ops/sec)  → ${result!.slice(0, 20)}...`,
	);
}

// 5. FNV-1a hash (fast, non-crypto)
function fnv1a(str: string): string {
	let hash = 2166136261;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = (hash * 16777619) >>> 0;
	}
	return hash.toString(36);
}

console.log(`Benchmarking ${iterations.toLocaleString()} iterations\n`);

bench('SHA256 (16 chars)', () => hashSha256(sql));
bench('MD5', () => hashMd5(sql));
bench('FNV-1a', () => fnv1a(sql));
bench('postgres.js (concat)', () => postgresStyle(sql, types));
bench('No transform', () => noTransform(sql));
