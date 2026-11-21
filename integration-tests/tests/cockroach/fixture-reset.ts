import type { Pool } from 'pg';

/**
 * Keeps a test file's fixture between tests instead of rebuilding it before each one: on CockroachDB every DDL
 * statement is a schema change job, and rebuilding the fixture cost each test ~0.5 s locally and 1.5-2 s on a busy
 * CI machine. Before a test, the returned function drops what the previous test added (schemas, tables, views,
 * sequences, types), then deletes the fixture tables' rows and restarts its sequences. A fixture table or view that a
 * test changed or dropped (its descriptor id or version differs: an ALTER, an index, a view or foreign key referencing
 * it) makes it call `create`, which must build the fixture from scratch, as the per-test setup used to.
 */
export const fixtureReset = (pool: Pool, create: () => Promise<void>) => {
	let snapshot: { objects: Map<string, string>; schemas: Set<string> } | undefined;

	const rows = async <T>(query: string) => (await pool.query(query)).rows as T[];

	// Every table, view and sequence of the database, with its descriptor id and version, in creation order.
	const descriptors = async () =>
		(await rows<{ schema_name: string; name: string; table_id: string; version: string }>(
			`select schema_name, name, table_id, version from crdb_internal.tables
			where database_name = current_database() and drop_time is null order by table_id`,
		)).map((r) => ({ name: `"${r.schema_name}"."${r.name}"`, key: `${r.table_id}:${r.version}` }));

	const userSchemas = async () =>
		new Set(
			(await rows<{ schema_name: string }>(`select schema_name from [show schemas]`))
				.map((r) => r.schema_name)
				.filter((name) => !['crdb_internal', 'pg_extension', 'pg_catalog', 'information_schema'].includes(name)),
		);

	const reset = async () => {
		if (!snapshot) return false;
		const schemas = await userSchemas();
		for (const schema of snapshot.schemas) if (!schemas.has(schema)) return false;
		for (const schema of schemas) {
			if (!snapshot.schemas.has(schema)) await pool.query(`drop schema "${schema}" cascade`);
		}

		let current = await descriptors();
		const added = current.filter((o) => !snapshot!.objects.has(o.name));
		if (added.length) {
			const kinds = new Map(
				(await rows<{ schema_name: string; table_name: string; type: string }>(
					`select schema_name, table_name, type from [show tables]`,
				)).map((r) => [`"${r.schema_name}"."${r.table_name}"`, r.type]),
			);
			// Views first, as they depend on tables; sequences last, as columns may use them.
			const order = ['materialized view', 'view', 'table', 'sequence'];
			added.sort((a, b) => order.indexOf(kinds.get(a.name) ?? 'table') - order.indexOf(kinds.get(b.name) ?? 'table'));
			for (const { name } of added) {
				const kind = kinds.get(name);
				if (kind) await pool.query(`drop ${kind} if exists ${name} cascade`);
			}
			current = await descriptors();
		}
		const byName = new Map(current.map((o) => [o.name, o.key]));
		for (const [name, key] of snapshot.objects) if (byName.get(name) !== key) return false;

		for (const type of await rows<{ schema: string; name: string }>(`select schema, name from [show types]`)) {
			await pool.query(`drop type "${type.schema}"."${type.name}"`);
		}

		const kinds = await rows<{ schema_name: string; table_name: string; type: string }>(
			`select schema_name, table_name, type from [show tables] where type in ('table', 'sequence')`,
		);
		const tables = new Set(kinds.filter((k) => k.type === 'table').map((k) => `"${k.schema_name}"."${k.table_name}"`));
		const sequences = kinds.filter((k) => k.type === 'sequence').map((k) => `"${k.schema_name}"."${k.table_name}"`);
		// Newest first: a table is created after the tables it references, so its rows go before theirs. One round
		// trip, as the statements take no parameters.
		await pool.query([
			...current.filter((o) => tables.has(o.name)).reverse().map((o) => `delete from ${o.name}`),
			...sequences.map((sequence) => `select setval('${sequence}', 1, false)`),
		].join(';\n'));
		return true;
	};

	return async () => {
		if (await reset()) return;
		await create();
		snapshot = {
			objects: new Map((await descriptors()).map((o) => [o.name, o.key])),
			schemas: await userSchemas(),
		};
	};
};
