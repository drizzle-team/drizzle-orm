import { sql } from 'drizzle-orm';
import { index, pgRole, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './mocks';

test('indexes #0', async (t) => {
	const schema1 = {
		users: pgTable(
			'users',
			{
				id: serial('id').primaryKey(),
				name: text('name'),
			},
			(
				t,
			) => [
				index('removeColumn').on(t.name, t.id),
				index('addColumn').on(t.name.desc()).with({ fillfactor: 70 }),
				index('removeExpression').on(t.name.desc(), sql`name`).concurrently(),
				index('addExpression').on(t.id.desc()),
				index('changeExpression').on(t.id.desc(), sql`name`),
				index('changeName').on(t.name.desc(), t.id.asc().nullsLast()).with({ fillfactor: 70 }),
				index('changeWith').on(t.name).with({ fillfactor: 70 }),
				index('changeUsing').on(t.name),
			],
		),
	};

	const schema2 = {
		users: pgTable(
			'users',
			{
				id: serial('id').primaryKey(),
				name: text('name'),
			},
			(t) => [
				index('removeColumn').on(t.name),
				index('addColumn').on(t.name.desc(), t.id.nullsLast()).with({ fillfactor: 70 }),
				index('removeExpression').on(t.name.desc()).concurrently(),
				index('addExpression').on(t.id.desc()),
				index('changeExpression').on(t.id.desc(), sql`name desc`),
				index('newName').on(t.name.desc(), sql`name`).with({ fillfactor: 70 }),
				index('changeWith').on(t.name).with({ fillfactor: 90 }),
				index('changeUsing').using('hash', t.name),
			],
		),
	};

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP INDEX "changeName";',
		'DROP INDEX "removeColumn";',
		'DROP INDEX "addColumn";',
		'DROP INDEX "removeExpression";',
		'DROP INDEX "changeExpression";',
		'DROP INDEX "changeWith";',
		'DROP INDEX "changeUsing";',
		'CREATE INDEX "newName" ON "users" USING btree ("name" DESC NULLS LAST,name) WITH (fillfactor=70);',
		'CREATE INDEX "removeColumn" ON "users" USING btree ("name");',
		'CREATE INDEX "addColumn" ON "users" USING btree ("name" DESC NULLS LAST,"id") WITH (fillfactor=70);',
		'CREATE INDEX CONCURRENTLY "removeExpression" ON "users" USING btree ("name" DESC NULLS LAST);',
		'CREATE INDEX "changeExpression" ON "users" USING btree ("id" DESC NULLS LAST,name desc);',
		'CREATE INDEX "changeWith" ON "users" USING btree ("name") WITH (fillfactor=90);',
		'CREATE INDEX "changeUsing" ON "users" USING hash ("name");',
	]);
});
