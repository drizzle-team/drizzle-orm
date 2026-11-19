// Benchmark of ddlDiff on large schemas. Skipped unless DDL_DIFF_BENCH=1.
// How to run it: see "Benchmarks" in tests/postgres/README.md.
import { index, integer, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { writeFileSync } from 'node:fs';
import { Session } from 'node:inspector/promises';
import { extractPostgresExisting } from 'src/dialects/drizzle';
import { createDDL, interimToDDL, type PostgresDDL } from 'src/dialects/postgres/ddl';
import { ddlDiffDry } from 'src/dialects/postgres/diff';
import { fromDrizzleSchema } from 'src/dialects/postgres/drizzle';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { test } from 'vitest';

const ENABLED = process.env['DDL_DIFF_BENCH'] === '1';
// table counts, override with DDL_DIFF_BENCH_TABLES=100,1000
const SIZES = (process.env['DDL_DIFF_BENCH_TABLES'] ?? '100,200,400').split(',').map(Number);
const RUNS = Number(process.env['DDL_DIFF_BENCH_RUNS'] ?? 5);
const COLUMNS = 20;

// Schema from drizzle tables, without tests/postgres/mocks.ts, which also starts databases
const toDDL = (tables: unknown[]): PostgresDDL => {
	const existing = extractPostgresExisting([], [], []);
	const filter = prepareEntityFilter(
		'postgresql',
		{ entities: undefined, extensions: undefined, schemas: undefined, tables: undefined } as any,
		existing,
	);
	const { schema, errors } = fromDrizzleSchema(
		{ schemas: [], tables, enums: [], sequences: [], roles: [], policies: [], views: [], matViews: [] } as any,
		filter,
	);
	if (errors.length > 0) throw new Error(JSON.stringify(errors));
	return interimToDDL(schema).ddl;
};

// `count` tables, each with a serial pk, COLUMNS columns with defaults, a timestamp, 2 indexes and an fk to the
// previous table. `varcharLength` changes one column per table, for the "one column changed" case.
const buildSchema = (count: number, varcharLength = 50): PostgresDDL => {
	const tables: any[] = [];
	for (let i = 0; i < count; i++) {
		const columns: Record<string, any> = { id: serial('id').primaryKey() };
		for (let j = 0; j < COLUMNS; j++) {
			const name = `c${j}`;
			columns[name] = j % 3 === 0
				? text(name).default('x')
				: j % 3 === 1
				? integer(name).notNull().default(0)
				: varchar(name, { length: j === 2 ? varcharLength : 50 });
		}
		columns['created'] = timestamp('created').defaultNow();
		const parent = tables[i - 1];
		if (parent) columns['parentId'] = integer('parent_id').references(() => parent.id);
		tables.push(
			pgTable(`t${i}`, columns, (t: any) => [index(`t${i}_c1`).on(t.c1), uniqueIndex(`t${i}_c2`).on(t.c2)]),
		);
	}
	return toDDL(tables);
};

// ddlDiff changes the states it gets, so every run diffs fresh copies. The copies are made outside the timing.
// vitest hides console output of tests, so results go to stdout directly
const print = (text: string) => process.stdout.write(`${text}\n`);

const timeDiff = async (from: PostgresDDL, to: PostgresDDL) => {
	const times: number[] = [];
	for (let i = 0; i < RUNS; i++) {
		const a = from.clone();
		const b = to.clone();
		const start = performance.now();
		await ddlDiffDry(a, b, 'default');
		times.push(performance.now() - start);
	}
	times.sort((x, y) => x - y);
	return `${times[Math.floor(times.length / 2)]!.toFixed(0)}ms`;
};

test.skipIf(!ENABLED)('ddlDiff benchmark', { timeout: 3_600_000 }, async () => {
	const rows: Record<string, string | number>[] = [];
	for (const count of SIZES) {
		const full = buildSchema(count);
		rows.push({
			tables: count,
			entities: full.entities.list().length,
			'empty -> full': await timeDiff(createDDL(), full),
			'no changes': await timeDiff(full, buildSchema(count)),
			'one column changed per table': await timeDiff(full, buildSchema(count, 51)),
		});
	}
	print(`\nddlDiff, median of ${RUNS} runs`);
	const headers = Object.keys(rows[0] ?? {});
	print(headers.join(' | '));
	for (const row of rows) print(headers.map((h) => String(row[h]).padStart(h.length)).join(' | '));

	// DDL_DIFF_PROFILE=<file>.cpuprofile writes a CPU profile of one "empty -> full" diff of the largest size.
	// Open it in Chrome DevTools (Performance tab) or VS Code.
	const profilePath = process.env['DDL_DIFF_PROFILE'];
	if (profilePath) {
		const target = buildSchema(Math.max(...SIZES));
		const session = new Session();
		session.connect();
		await session.post('Profiler.enable');
		await session.post('Profiler.start');
		await ddlDiffDry(createDDL(), target, 'default');
		const { profile } = await session.post('Profiler.stop');
		session.disconnect();
		writeFileSync(profilePath, JSON.stringify(profile));
		print(`CPU profile written to ${profilePath}`);
	}
});
