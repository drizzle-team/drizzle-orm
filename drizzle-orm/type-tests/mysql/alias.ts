import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { alias } from '~/mysql-core/alias.ts';
import { int, mysqlSchema, mysqlTable, mysqlView, text } from '~/mysql-core/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';

const mySchema = mysqlSchema('my_schema');

const table = mysqlTable('table', {
	id: int('id').notNull(),
	name: text('name'),
});

const schemaTable = mySchema.table('table', {
	id: int('id').notNull(),
	name: text('name'),
});

const view = mysqlView('view').as((qb) => qb.select().from(table));
const manualView = mysqlView('manual_view', {
	id: int('id').notNull(),
	name: text('name'),
}).as(sql`select * from ${table}`);
const existingView = mysqlView('existing_view', {
	id: int('id').notNull(),
	name: text('name'),
}).existing();
const schemaView = mySchema.view('schema_view').as((qb) => qb.select().from(schemaTable));
const schemaExistingView = mySchema.view('schema_existing_view', {
	id: int('id').notNull(),
	name: text('name'),
}).existing();

type SelectedRow = { id: number; name: string | null };

{
	Expect<Equal<typeof table['_']['isAlias'], false>>;
	Expect<Equal<typeof schemaTable['_']['isAlias'], false>>;
	Expect<Equal<typeof view['_']['isAlias'], false>>;
	Expect<Equal<typeof manualView['_']['isAlias'], false>>;
	Expect<Equal<typeof existingView['_']['isAlias'], false>>;
	Expect<Equal<typeof schemaView['_']['isAlias'], false>>;
	Expect<Equal<typeof schemaExistingView['_']['isAlias'], false>>;
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
	const aliased = alias(schemaTable, 'aliased_schema_table');

	Expect<Equal<typeof aliased['_']['name'], 'aliased_schema_table'>>;
	Expect<Equal<typeof aliased['_']['isAlias'], true>>;
	Expect<Equal<typeof aliased['_']['schema'], 'my_schema'>>;
	Expect<Equal<typeof aliased['_']['columns']['id']['_']['tableName'], 'aliased_schema_table'>>;

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
	const aliased = alias(schemaView, 'aliased_schema_view');

	Expect<Equal<typeof aliased['_']['name'], 'aliased_schema_view'>>;
	Expect<Equal<typeof aliased['_']['isAlias'], true>>;
	Expect<Equal<typeof aliased['_']['schema'], 'my_schema'>>;
	Expect<Equal<typeof aliased['_']['existing'], false>>;
	Expect<Equal<typeof aliased['_']['selectedFields']['id']['_']['tableName'], 'aliased_schema_view'>>;

	const result = await db.select().from(aliased);
	Expect<Equal<typeof result, SelectedRow[]>>;
}

{
	const aliased = alias(schemaExistingView, 'aliased_schema_existing_view');

	Expect<Equal<typeof aliased['_']['name'], 'aliased_schema_existing_view'>>;
	Expect<Equal<typeof aliased['_']['isAlias'], true>>;
	Expect<Equal<typeof aliased['_']['schema'], 'my_schema'>>;
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
	const aliasedSchemaTable = alias(schemaTable, 'aliased_schema_table');
	const aliasedSchemaView = alias(schemaView, 'aliased_schema_view');

	const result = await db.select().from(aliasedSchemaTable).innerJoin(aliasedSchemaView, sql`true`);
	Expect<Equal<typeof result, { aliased_schema_table: SelectedRow; aliased_schema_view: SelectedRow }[]>>;

	const leftJoined = await db.select().from(aliasedSchemaTable).leftJoin(aliasedSchemaView, sql`true`);
	Expect<Equal<typeof leftJoined, { aliased_schema_table: SelectedRow; aliased_schema_view: SelectedRow | null }[]>>;
}

{
	const aliasedView = alias(view, 'aliased_view');
	const aliasedExistingView = alias(existingView, 'aliased_existing_view');

	const result = await db
		.select()
		.from(aliasedView)
		.innerJoin(aliasedExistingView, sql`true`);
	Expect<Equal<typeof result, { aliased_view: SelectedRow; aliased_existing_view: SelectedRow }[]>>;

	const leftJoined = await db
		.select()
		.from(aliasedView)
		.leftJoin(aliasedExistingView, sql`true`);
	Expect<Equal<typeof leftJoined, { aliased_view: SelectedRow; aliased_existing_view: SelectedRow | null }[]>>;
}
