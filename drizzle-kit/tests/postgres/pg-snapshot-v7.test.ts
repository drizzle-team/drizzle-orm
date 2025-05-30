import { sql } from 'drizzle-orm';
import {
	AnyPgColumn,
	foreignKey,
	integer,
	pgEnum,
	pgMaterializedView,
	pgSchema,
	pgTable,
	pgView,
	primaryKey,
	serial,
	text,
	unique,
} from 'drizzle-orm/pg-core';
import { upToV8 } from 'src/cli/commands/up-postgres';
import { fromEntities } from 'src/dialects/postgres/ddl';
import { serializePg } from 'src/legacy/postgres-v7/serializer';
import { diff as legacyDiff } from 'src/legacy/postgres-v7/snapshotsDiffer';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('snapshot 1', async (t) => {
	enum E {
		value = 'value',
	}

	const folder = pgSchema('folder');
	const en = pgEnum('e', E);
	const users = pgTable('users', {
		id: serial().primaryKey(),
		enum: en(),
		text: text().unique(),
		text1: text(),
		text2: text(),
	}, (t) => [unique().on(t.text1, t.text2)]);

	const users1 = pgTable('users1', {
		id1: integer(),
		id2: integer(),
	}, (t) => [primaryKey({ columns: [t.id1, t.id2] })]);

	const users2 = pgTable('users2', {
		id: serial(),
		c1: text().unique(),
		c2: text().unique('c2unique'),
		c3: text().unique('c3unique', { nulls: 'distinct' }),
	}, (t) => [primaryKey({ columns: [t.id] })]);

	const users3 = pgTable('users3', {
		c1: text(),
		c2: text(),
		c3: text(),
	}, (t) => [
		unique().on(t.c1),
		unique('u3c2unique').on(t.c2),
		unique('u3c3unique').on(t.c3).nullsNotDistinct(),
		unique('u3c2c3unique').on(t.c2, t.c3),
	]);

	const users4 = pgTable('users4', {
		c1: text().unique().references(() => users3.c1),
		c2: text().references((): AnyPgColumn => users4.c1),
		c3: text(),
		c4: text(),
		c5: text().array().default([]),
		c6: text().array().array().default([[]]),
		c7: text().array().array().array().default([[[]]]),
		c8: text().array(2).array(10),
	}, (t) => [foreignKey({ columns: [t.c3, t.c4], foreignColumns: [users3.c2, users3.c3] })]);

	const users5 = pgTable('users5', {
		fullName: text(),
	});

	const schema1 = {
		folder,
		en,
		users,
		users1,
		users2,
		users3,
		users4,
		users5,
	};

	const res = await serializePg(schema1, 'camelCase');
	const { sqlStatements } = await legacyDiff({ right: res });

	for (const st of sqlStatements) {
		await db.query(st);
	}

	const { snapshot, hints } = upToV8(res);
	const ddl = fromEntities(snapshot.ddl);
	const { sqlStatements: st, next } = await diff(ddl, schema1, []);
	const { sqlStatements: pst } = await push({ db, to: schema1 });

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);

	const { sqlStatements: st1 } = await diff(next, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });

	expect(st1).toStrictEqual([]);
	expect(pst1).toStrictEqual([]);
});
