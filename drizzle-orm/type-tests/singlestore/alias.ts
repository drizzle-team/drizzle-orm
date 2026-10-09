import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { alias } from '~/singlestore-core/alias.ts';
import { int, singlestoreSchema, singlestoreTable, text } from '~/singlestore-core/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';

const mySchema = singlestoreSchema('my_schema');

const table = singlestoreTable('table', {
	id: int('id').notNull(),
	name: text('name'),
});

const schemaTable = mySchema.table('table', {
	id: int('id').notNull(),
	name: text('name'),
});

type SelectedRow = { id: number; name: string | null };

{
	Expect<Equal<typeof table['_']['isAlias'], false>>;
	Expect<Equal<typeof schemaTable['_']['isAlias'], false>>;
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

	const result = await db.select().from(table).innerJoin(aliasedSchemaTable, sql`true`);
	Expect<Equal<typeof result, { table: SelectedRow; aliased_schema_table: SelectedRow }[]>>;

	const leftJoined = await db.select().from(table).leftJoin(aliasedSchemaTable, sql`true`);
	Expect<Equal<typeof leftJoined, { table: SelectedRow; aliased_schema_table: SelectedRow | null }[]>>;
}
