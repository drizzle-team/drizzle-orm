import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { sql } from '~/sql/sql.ts';
import { alias, integer, sqliteTable, sqliteView, text } from '~/sqlite-core/index.ts';
import { db } from './db.ts';

const table = sqliteTable('table', {
	id: integer('id').notNull(),
	name: text('name'),
});

const view = sqliteView('view').as((qb) => qb.select().from(table));
const manualView = sqliteView('manual_view', {
	id: integer('id').notNull(),
	name: text('name'),
}).as(sql`select * from ${table}`);
const existingView = sqliteView('existing_view', {
	id: integer('id').notNull(),
	name: text('name'),
}).existing();

type SelectedRow = { id: number; name: string | null };

{
	Expect<Equal<typeof table['_']['isAlias'], false>>;
	Expect<Equal<typeof view['_']['isAlias'], false>>;
	Expect<Equal<typeof manualView['_']['isAlias'], false>>;
	Expect<Equal<typeof existingView['_']['isAlias'], false>>;
}

{
	const aliased = alias(table, 'aliased_table');

	Expect<Equal<typeof aliased['_']['name'], 'aliased_table'>>;
	Expect<Equal<typeof aliased['_']['isAlias'], true>>;
	Expect<Equal<typeof aliased['_']['schema'], undefined>>;
	Expect<Equal<typeof aliased['_']['columns']['id']['_']['tableName'], 'aliased_table'>>;
	Expect<Equal<typeof aliased['_']['columns']['name']['_']['tableName'], 'aliased_table'>>;

	const result = await db.select().from(aliased);
	Expect<Equal<typeof result, SelectedRow[]>>;
}

{
	const aliased = alias(view, 'aliased_view');

	Expect<Equal<typeof aliased['_']['name'], 'aliased_view'>>;
	Expect<Equal<typeof aliased['_']['isAlias'], true>>;
	Expect<Equal<typeof aliased['_']['schema'], undefined>>;
	Expect<Equal<typeof aliased['_']['existing'], false>>;
	Expect<Equal<typeof aliased['_']['selectedFields']['id']['_']['tableName'], 'aliased_view'>>;

	const result = await db.select().from(aliased);
	Expect<Equal<typeof result, SelectedRow[]>>;
}

{
	const aliased = alias(manualView, 'aliased_manual_view');

	Expect<Equal<typeof aliased['_']['name'], 'aliased_manual_view'>>;
	Expect<Equal<typeof aliased['_']['isAlias'], true>>;
	Expect<Equal<typeof aliased['_']['schema'], undefined>>;
	Expect<Equal<typeof aliased['_']['existing'], false>>;
	Expect<Equal<typeof aliased['_']['selectedFields']['id']['_']['tableName'], 'aliased_manual_view'>>;

	const result = await db.select().from(aliased);
	Expect<Equal<typeof result, SelectedRow[]>>;
}

{
	const aliased = alias(existingView, 'aliased_existing_view');

	Expect<Equal<typeof aliased['_']['name'], 'aliased_existing_view'>>;
	Expect<Equal<typeof aliased['_']['isAlias'], true>>;
	Expect<Equal<typeof aliased['_']['schema'], undefined>>;
	Expect<Equal<typeof aliased['_']['existing'], true>>;

	const result = await db.select().from(aliased);
	Expect<Equal<typeof result, SelectedRow[]>>;
}

{
	const first = alias(table, 'first');
	const second = alias(table, 'second');

	const result = await db.select().from(first).innerJoin(second, sql`true`);
	Expect<Equal<typeof result, { first: SelectedRow; second: SelectedRow }[]>>;
}

{
	const aliasedTable = alias(table, 'aliased_table');

	const result = await db.select().from(table).innerJoin(aliasedTable, sql`true`);
	Expect<Equal<typeof result, { table: SelectedRow; aliased_table: SelectedRow }[]>>;
}

{
	const aliasedView = alias(view, 'aliased_view');
	const aliasedExistingView = alias(existingView, 'aliased_existing_view');

	const result = await db.select().from(aliasedView).innerJoin(aliasedExistingView, sql`true`);
	Expect<Equal<typeof result, { aliased_view: SelectedRow; aliased_existing_view: SelectedRow }[]>>;

	const leftJoined = await db.select().from(aliasedView).leftJoin(aliasedExistingView, sql`true`);
	Expect<Equal<typeof leftJoined, { aliased_view: SelectedRow; aliased_existing_view: SelectedRow | null }[]>>;
}
