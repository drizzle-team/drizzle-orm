/**
 * Keeps a test file's fixture between tests instead of rebuilding it before each one: dropping and creating ~15
 * tables cost each test ~0.5 s on a busy CI machine. Before a test, the returned function drops what the previous
 * test added (tables, views, sequences, schemas), then deletes the fixture tables' rows and restarts the identity
 * counters that moved. A fixture table or view that a test changed or dropped (its object_id or modify_date differs:
 * an ALTER, an index, a recreate) makes it call `create`, which must build the fixture from scratch, as the
 * per-test setup used to.
 */
export const fixtureReset = (query: (sql: string) => Promise<any[]>, create: () => Promise<void>) => {
	let snapshot: { objects: Map<string, string>; schemas: Set<string>; deleteOrder: string[] } | undefined;

	type Row = { s: string; n: string; t: string; id: number; md: string };
	const objects = async () =>
		(await query(`
			select s.name as s, o.name as n, rtrim(o.type) as t, o.object_id as id,
				convert(varchar(30), o.modify_date, 126) as md
			from sys.objects o join sys.schemas s on s.schema_id = o.schema_id
			where o.type in ('U', 'V', 'SO') and o.is_ms_shipped = 0
		`) as Row[]).map((r) => ({ ...r, name: `[${r.s}].[${r.n}]`, key: `${r.id}:${r.md}` }));

	// dbo and the schemas tests create; not the built-in ones (guest, sys, INFORMATION_SCHEMA) or role schemas.
	const userSchemas = async () =>
		new Set(
			(await query(`select name from sys.schemas where schema_id = 1 or schema_id between 5 and 16383`)).map((r) =>
				r.name as string
			),
		);

	/** The fixture's tables, each after every table whose foreign keys reference it. */
	const deleteOrder = async (tables: { id: number; name: string }[]) => {
		const edges = await query(
			`select parent_object_id as child, referenced_object_id as parent from sys.foreign_keys`,
		) as { child: number; parent: number }[];
		const ordered: string[] = [];
		const left = new Map(tables.map((t) => [t.id, t.name]));
		while (left.size) {
			// Tables no remaining table references (a self-reference does not count) go first.
			const ready = [...left.keys()].filter((id) =>
				!edges.some((e) => e.parent === id && e.child !== id && left.has(e.child))
			);
			if (!ready.length) throw new Error('fixtureReset: foreign keys form a cycle');
			for (const id of ready) {
				ordered.push(left.get(id)!);
				left.delete(id);
			}
		}
		return ordered;
	};

	const reset = async () => {
		if (!snapshot) return false;

		// What a test added: foreign keys of added tables first, then views, tables and sequences, then schemas.
		const current = await objects();
		const added = current.filter((o) => !snapshot!.objects.has(o.name));
		const addedTables = added.filter((o) => o.t === 'U');
		if (addedTables.length) {
			const fks = await query(`
				select object_schema_name(parent_object_id) as s, object_name(parent_object_id) as n, name as fk
				from sys.foreign_keys where parent_object_id in (${addedTables.map((o) => o.id).join(', ')})
			`);
			for (const fk of fks) await query(`alter table [${fk.s}].[${fk.n}] drop constraint [${fk.fk}]`);
		}
		for (const type of ['V', 'U', 'SO']) {
			const kind = type === 'V' ? 'view' : type === 'U' ? 'table' : 'sequence';
			for (const o of added.filter((x) => x.t === type)) await query(`drop ${kind} if exists ${o.name}`);
		}
		const schemas = await userSchemas();
		for (const schema of schemas) if (!snapshot.schemas.has(schema)) await query(`drop schema [${schema}]`);

		const byName = new Map(current.map((o) => [o.name, o.key]));
		for (const [name, key] of snapshot.objects) if (byName.get(name) !== key) return false;
		for (const schema of snapshot.schemas) if (!schemas.has(schema)) return false;

		const reseed = await query(`
			select object_schema_name(object_id) as s, object_name(object_id) as n from sys.identity_columns
			where last_value is not null and objectproperty(object_id, 'IsUserTable') = 1
		`);
		// One batch. RESEED 0 on a table that has had rows makes the next identity 1.
		await query([
			...snapshot.deleteOrder.map((name) => `delete from ${name};`),
			...reseed.map((r) => `dbcc checkident ('[${r.s}].[${r.n}]', reseed, 0) with no_infomsgs;`),
		].join('\n'));
		return true;
	};

	return async () => {
		if (await reset()) return;
		await create();
		const created = await objects();
		snapshot = {
			objects: new Map(created.map((o) => [o.name, o.key])),
			schemas: await userSchemas(),
			deleteOrder: await deleteOrder(created.filter((o) => o.t === 'U')),
		};
	};
};
