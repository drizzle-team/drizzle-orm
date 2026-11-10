import type { Connection } from 'mysql2/promise';

/**
 * Keeps a test file's fixture between tests instead of rebuilding it before each one: a MySQL DROP or CREATE
 * TABLE removes or writes a file, and rebuilding ~15 tables cost a test ~150 ms locally and 1-2 s on a busy CI
 * machine. Before a test, the returned function drops what the previous test added to the fixture's schemas, then
 * deletes the fixture tables' rows and restarts their auto-increment counters. A table or view of the fixture that
 * a test changed or dropped (its columns, indexes, foreign keys or definition differ) makes it call `create`, which
 * must build the fixture from scratch, as the per-test setup used to.
 */
export const fixtureReset = (client: Connection, schemas: string[], create: () => Promise<void>) => {
	let snapshot: Map<string, string> | undefined;

	const inSchemas = schemas.map((schema) => (schema === '' ? 'database()' : client.escape(schema))).join(', ');
	// One row per table or view, with a hash of its definition. Statistics are read fresh: information_schema
	// otherwise caches auto_increment for a day.
	const objects = async () => {
		await client.query('set session information_schema_stats_expiry = 0');
		const [rows] = await client.query(`
			select t.table_schema as s, t.table_name as n, t.table_type as k, t.auto_increment as ai, md5(concat_ws('#',
				(select group_concat(concat_ws('|', column_name, column_type, is_nullable, coalesce(column_default, ''), extra)
					order by ordinal_position) from information_schema.columns c
					where c.table_schema = t.table_schema and c.table_name = t.table_name),
				(select group_concat(concat_ws('|', index_name, column_name, seq_in_index, non_unique)
					order by index_name, seq_in_index) from information_schema.statistics x
					where x.table_schema = t.table_schema and x.table_name = t.table_name),
				(select group_concat(concat_ws('|', constraint_name, column_name, referenced_table_schema, referenced_table_name,
					referenced_column_name) order by constraint_name, ordinal_position) from information_schema.key_column_usage u
					where u.table_schema = t.table_schema and u.table_name = t.table_name and u.referenced_table_name is not null),
				(select view_definition from information_schema.views v
					where v.table_schema = t.table_schema and v.table_name = t.table_name)
			)) as h
			from information_schema.tables t where t.table_schema in (${inSchemas})
		`);
		return (rows as { s: string; n: string; k: string; ai: number | null; h: string }[]).map((r) => ({
			...r,
			name: `\`${r.s}\`.\`${r.n}\``,
		}));
	};

	const reset = async () => {
		if (!snapshot) return false;
		const current = await objects();
		const byName = new Map(current.map((o) => [o.name, o]));
		for (const [name, hash] of snapshot) {
			if (byName.get(name)?.h !== hash) return false;
		}

		await client.query('set foreign_key_checks = 0');
		try {
			// What a test added: views first, as they depend on tables.
			const added = current.filter((o) => !snapshot!.has(o.name)).sort((a, b) =>
				Number(a.k === 'BASE TABLE') - Number(b.k === 'BASE TABLE')
			);
			for (const o of added) await client.query(`drop ${o.k === 'VIEW' ? 'view' : 'table'} if exists ${o.name}`);

			for (const o of current) {
				if (o.k !== 'BASE TABLE' || !snapshot.has(o.name)) continue;
				await client.query(`delete from ${o.name}`);
				if (o.ai !== null && o.ai > 1) await client.query(`alter table ${o.name} auto_increment = 1`);
			}
		} finally {
			await client.query('set foreign_key_checks = 1');
		}
		return true;
	};

	return async () => {
		if (await reset()) return;
		await create();
		snapshot = new Map((await objects()).map((o) => [o.name, o.h]));
	};
};
