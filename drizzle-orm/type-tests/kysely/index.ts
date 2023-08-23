import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { type Equal, Expect } from 'type-tests/utils.ts';
import type { Kyselify } from '~/kysely/index.ts';
import { char, mysqlTable, timestamp as mysqlTimestamp, varchar as mysqlVarchar } from '~/mysql-core/index.ts';
import { integer, pgEnum, pgTable, serial, text, timestamp, varchar } from '~/pg-core/index.ts';
import type { PromiseOf } from '~/utils.ts';

const { Pool } = pg;

const test = pgTable('test', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

interface Database {
	test: Kyselify<typeof test>;
}

const db = new Kysely<Database>({
	dialect: new PostgresDialect({
		pool: new Pool(),
	}),
});

const result = db.selectFrom('test').selectAll().execute();
Expect<Equal<PromiseOf<typeof result>, typeof test.$inferSelect[]>>();

{
	const units = mysqlTable('units', {
		id: char('id', { length: 16 }).primaryKey(),
		name: mysqlVarchar('name', { length: 255 }).notNull(),
		abbreviation: mysqlVarchar('abbreviation', { length: 10 }).notNull(),
		created_at: mysqlTimestamp('created_at').defaultNow().notNull(),
		updated_at: mysqlTimestamp('updated_at').defaultNow().notNull().onUpdateNow(),
	});

	type UnitModel = typeof units;

	interface Database {
		units: Kyselify<UnitModel>;
	}

	const db = new Kysely<Database>({
		dialect: new PostgresDialect({
			pool: new Pool(),
		}),
	});

	await db
		.insertInto('units')
		.values({
			id: 'my-unique-id',
			abbreviation: 'foo',
			name: 'bar',
		})
		.execute();
}

{
	const uploadStateEnum = pgEnum('upload_state', ['uploading', 'uploaded', 'failed']);
	const uploadTypeEnum = pgEnum('upload_type', ['image', 'video']);

	const uploads = pgTable('uploads', {
		id: varchar('id', { length: 100 }).primaryKey(),
		state: uploadStateEnum('state').notNull().default('uploading'),
		type: uploadTypeEnum('type').notNull(),
		fileName: varchar('file_name', { length: 100 }).notNull(),
		fileType: varchar('file_type', { length: 100 }).notNull(),
		fileSize: integer('file_size').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		uploadedAt: timestamp('uploaded_at'),
	});

	interface Database {
		uploads: Kyselify<typeof uploads>;
	}

	const db = new Kysely<Database>({
		dialect: new PostgresDialect({
			pool: new Pool(),
		}),
	});

	await db
		.insertInto('uploads')
		.values({
			id: '1',
			file_name: 'fileName',
			file_type: 'contentType',
			type: 'image',
			file_size: 1,
		})
		.returning('id')
		.executeTakeFirst();
}
