import retry from 'async-retry';
import type Docker from 'dockerode';
import { sql } from 'drizzle-orm';
import {
	boolean,
	int,
	json,
	mysqlTable as mysqlTableRaw,
	mysqlTableCreator,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from 'drizzle-orm/mysql-core';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import * as mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createDockerDB } from './mysql-common';

let db: MySql2Database;
let client: mysql.Connection;
let container: Docker.Container | undefined;

beforeAll(async () => {
	let connectionString;
	if (process.env['MYSQL_CONNECTION_STRING']) {
		connectionString = process.env['MYSQL_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr, container: contrainerObj } = await createDockerDB();
		connectionString = conStr;
		container = contrainerObj;
	}
	client = await retry(async () => {
		client = await mysql.createConnection(connectionString);
		await client.connect();
		return client;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 250,
		maxTimeout: 250,
		randomize: false,
		onRetry() {
			client?.end();
		},
	});
	db = drizzle(client);
});

afterAll(async () => {
	await client?.end();
	await container?.stop().catch(console.error);
});

const tablePrefix = 'drizzle_tests_';

const mysqlTable = mysqlTableCreator((name) => `${tablePrefix}${name}`);
const usersTable = mysqlTable('userstest', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: json('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
});

const users2Table = mysqlTable('users2', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	cityId: int('city_id').references(() => citiesTable.id),
});

const citiesTable = mysqlTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

beforeEach(async () => {
	await db.execute(sql`drop table if exists ${usersTable}`);
	await db.execute(sql`drop table if exists ${users2Table}`);
	await db.execute(sql`drop table if exists ${citiesTable}`);

	await db.execute(
		sql`
			create table ${usersTable} (
				\`id\` serial primary key,
				\`name\` text not null,
				\`verified\` boolean not null default false,
				\`jsonb\` json,
				\`created_at\` timestamp not null default now()
			)
		`,
	);

	await db.execute(
		sql`
			create table ${users2Table} (
				\`id\` serial primary key,
				\`name\` text not null,
				\`city_id\` int references ${citiesTable}(\`id\`)
			)
		`,
	);

	await db.execute(
		sql`
			create table ${citiesTable} (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`,
	);
});

test('migrator', async () => {
	const usersMigratorTable = mysqlTableRaw('users12', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull(),
	}, (table) => {
		return {
			name: uniqueIndex('').on(table.name).using('btree'),
		};
	});

	await db.execute(sql.raw(`drop table if exists cities_migration`));
	await db.execute(sql.raw(`drop table if exists users_migration`));
	await db.execute(sql.raw(`drop table if exists users12`));
	await db.execute(sql.raw(`drop table if exists __drizzle_migrations`));

	await migrate(db, { migrationsFolder: './drizzle2/mysql' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

	const result = await db.select().from(usersMigratorTable);

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql.raw(`drop table cities_migration`));
	await db.execute(sql.raw(`drop table users_migration`));
	await db.execute(sql.raw(`drop table users12`));
	await db.execute(sql.raw(`drop table __drizzle_migrations`));
});
