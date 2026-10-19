import {
	diffMySql,
	type InterimStudioSchema as MysqlState,
	studioSchemaToDDL as studioSchemaToDDLMysql,
} from 'src/ext/studio-mysql';
import {
	diffPostgresql,
	type InterimStudioSchema as PostgresState,
	studioSchemaToDDL as studioSchemaToDDLPostgres,
} from 'src/ext/studio-postgres';
import {
	diffSqlite,
	type InterimStudioSchema as SqliteState,
	studioSchemaToDDL as studioSchemaToDDLSqlite,
} from 'src/ext/studio-sqlite';
import { expect, test } from 'vitest';

// Verifies the Drizzle Studio diffs `diffPostgresql`, `diffMySql` and `diffSqlite` after a confirmed rename of
// a column or a table. The new state can still name the old column or table in constraints, indexes, foreign
// keys and policies. The diff must read these old names as the renamed ones. So it gives the rename statement,
// plus only the statements of a real change. The states are built in memory, with no database.

// The new states in these tests copy what Drizzle Studio sends. Studio renames a column only in the column
// list of the edited table, and it copies the policies and every other table from the old state. So the new
// state can still hold an old column name in the constraints and the indexes of the edited table, and an old
// table name or an old column name in the policies and in the foreign keys of other tables.

type PostgresTable = PostgresState['tables'][number];

const postgresColumn = (table: string, name: string): PostgresTable['columns'][number] => ({
	schema: 'public',
	table,
	name,
	type: 'integer',
	typeSchema: null,
	notNull: true,
	dimensions: 0,
	default: null,
	generated: null,
	identity: null,
	pk: false,
	pkName: null,
	unique: false,
	uniqueName: null,
	uniqueNullsNotDistinct: false,
});

const postgresIndex = (table: string, name: string, columns: string[]): PostgresTable['indexes'][number] => ({
	schema: 'public',
	table,
	name,
	nameExplicit: true,
	columns: columns.map((value) => ({ value, isExpression: false, asc: true, nullsFirst: false, opclass: null })),
	isUnique: false,
	where: null,
	with: '',
	method: 'btree',
	concurrently: false,
	forPK: false,
	forUnique: false,
});

const postgresForeignKey = (
	table: string,
	columns: string[],
	tableTo: string,
	columnsTo: string[],
): PostgresTable['fks'][number] => ({
	schema: 'public',
	table,
	name: `${table}_${tableTo}_fk`,
	nameExplicit: true,
	columns,
	schemaTo: 'public',
	tableTo,
	columnsTo,
	onUpdate: 'NO ACTION',
	onDelete: 'NO ACTION',
});

const postgresTable = (name: string, columns: string[], rest: Partial<PostgresTable> = {}): PostgresTable => ({
	schema: 'public',
	name,
	isRlsEnabled: false,
	columns: columns.map((column) => postgresColumn(name, column)),
	pks: [],
	fks: [],
	uniques: [],
	checks: [],
	indexes: [],
	...rest,
});

const postgresState = (tables: PostgresTable[], policies: PostgresState['policies'] = []): PostgresState => ({
	schemas: [],
	tables,
	views: [],
	enums: [],
	sequences: [],
	roles: [],
	privileges: [],
	policies,
});

test('postgres: change schema of a table', async () => {
	const state = {
		schemas: [{
			entityType: 'schemas' as const,
			name: 'public',
		}, {
			entityType: 'schemas' as const,
			name: 'other',
		}],
		tables: [postgresTable('users', ['id'])],
		views: [],
		enums: [],
		sequences: [],
		roles: [],
		privileges: [],
		policies: [],
	};
	const ddl1 = studioSchemaToDDLPostgres(state);
	const ddl2 = studioSchemaToDDLPostgres(state);

	ddl2.tables.update({
		set: { schema: 'other' },
		where: { schema: 'public', name: 'users' },
	});

	const { sqlStatements } = await diffPostgresql(
		ddl1,
		ddl2,
		['public.users->other.users'],
	);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" SET SCHEMA "other";']);
});

test('postgres: the constraints and the index of a table follow a renamed column', async () => {
	const parent = postgresTable('parent', ['id']);
	const users = postgresTable('users', ['id', 'email'], {
		pks: [{ schema: 'public', table: 'users', name: 'users_pkey', nameExplicit: true, columns: ['id'] }],
		uniques: [{
			schema: 'public',
			table: 'users',
			name: 'users_id_email_key',
			nameExplicit: true,
			columns: ['id', 'email'],
			nullsNotDistinct: false,
		}],
		fks: [postgresForeignKey('users', ['id'], 'parent', ['id'])],
		indexes: [postgresIndex('users', 'users_id_idx', ['id'])],
	});

	const state = postgresState([parent, users]);
	const ddl1 = studioSchemaToDDLPostgres(state);
	const ddl2 = studioSchemaToDDLPostgres(state);

	ddl2.rename(ddl1.columns.one({ table: 'users', name: 'id' })!, {
		name: 'key',
	});

	const { sqlStatements } = await diffPostgresql(
		ddl1,
		ddl2,
		['public.users.id->public.users.key'],
	);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" RENAME COLUMN "id" TO "key";\n']);
});

test('postgres: the foreign key of another table follows a renamed column', async () => {
	const parent = postgresTable('parent', ['id']);
	const child = postgresTable('child', ['parentId'], {
		fks: [postgresForeignKey('child', ['parentId'], 'parent', ['id'])],
	});

	const state = postgresState([parent, child]);
	const ddl1 = studioSchemaToDDLPostgres(state);
	const ddl2 = studioSchemaToDDLPostgres(state);

	ddl2.rename(ddl1.columns.one({ table: 'parent', name: 'id' })!, {
		name: 'key',
	});

	const { sqlStatements } = await diffPostgresql(
		ddl1,
		ddl2,
		['public.parent.id->public.parent.key'],
	);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "parent" RENAME COLUMN "id" TO "key";']);
});

test('postgres: the foreign key of another table follows a renamed table', async () => {
	const child = postgresTable('child', ['parentId'], {
		fks: [postgresForeignKey('child', ['parentId'], 'parent', ['id'])],
	});

	const state = postgresState([postgresTable('parent', ['id']), child]);
	const ddl1 = studioSchemaToDDLPostgres(state);
	const ddl2 = studioSchemaToDDLPostgres(state);

	ddl2.rename(ddl1.tables.one({ name: 'parent' })!, {
		name: 'owner',
	});

	const { sqlStatements } = await diffPostgresql(
		ddl1,
		ddl2,
		['public.parent->public.owner'],
	);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "parent" RENAME TO "owner";']);
});

test('postgres: the policy of a table follows the renamed table', async () => {
	const policies: PostgresState['policies'] = [{
		entityType: 'policies',
		schema: 'public',
		table: 'parent',
		name: 'parent_read',
		as: 'PERMISSIVE',
		for: 'SELECT',
		roles: ['public'],
		using: 'true',
		withCheck: null,
	}];

	const state = postgresState([postgresTable('parent', ['id'], { isRlsEnabled: true })], policies);
	const ddl1 = studioSchemaToDDLPostgres(state);
	const ddl2 = studioSchemaToDDLPostgres(state);

	ddl2.rename(ddl1.tables.one({ name: 'parent' })!, {
		name: 'owner',
	});

	const { sqlStatements } = await diffPostgresql(
		ddl1,
		ddl2,
		['public.parent->public.owner'],
	);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "parent" RENAME TO "owner";']);
});

test('postgres: add role and privilege without grantor (because must be the current user)', async () => {
	const state = postgresState([postgresTable('parent', ['id'])]);
	const ddl1 = studioSchemaToDDLPostgres(state);
	const ddl2 = studioSchemaToDDLPostgres(state);

	ddl2.roles.push({
		name: 'user',
	});
	ddl2.privileges.push({
		schema: 'public',
		table: 'parent',
		name: 'parent_select',
		grantee: 'user',
		type: 'SELECT',
		isGrantable: false,
	});

	const { sqlStatements } = await diffPostgresql(
		ddl1,
		ddl2,
		[],
	);

	expect(sqlStatements).toStrictEqual([
		'CREATE ROLE "user" WITH NOINHERIT;',
		'GRANT SELECT ON "parent" TO "user";',
	]);
});

type MysqlTable = MysqlState['tables'][number];

const mysqlColumn = (table: string, name: string): MysqlTable['columns'][number] => ({
	table,
	name,
	type: 'int',
	notNull: true,
	autoIncrement: false,
	default: null,
	onUpdateNow: false,
	onUpdateNowFsp: null,
	charSet: null,
	collation: null,
	generated: null,
	isPK: false,
	isUnique: false,
	uniqueName: null,
});

const mysqlForeignKey = (
	table: string,
	columns: string[],
	tableTo: string,
	columnsTo: string[],
): MysqlTable['fks'][number] => ({
	table,
	name: `${table}_${tableTo}_fk`,
	nameExplicit: true,
	columns,
	tableTo,
	columnsTo,
	onUpdate: 'NO ACTION',
	onDelete: 'NO ACTION',
});

const mysqlIndex = (table: string, name: string, columns: string[]): MysqlTable['indexes'][number] => ({
	table,
	name,
	nameExplicit: true,
	columns: columns.map((value) => ({ value, isExpression: false })),
	isUnique: false,
	using: null,
	algorithm: null,
	lock: null,
});

const mysqlTable = (name: string, columns: string[], rest: Partial<MysqlTable> = {}): MysqlTable => ({
	name,
	columns: columns.map((column) => mysqlColumn(name, column)),
	pks: [],
	fks: [],
	checks: [],
	indexes: [],
	...rest,
});

const mysqlState = (tables: MysqlTable[]): MysqlState => ({ tables, views: [] });

test('mysql: the constraints and the index of a table follow a renamed column', async () => {
	const parent = mysqlTable('parent', ['id']);
	const users = mysqlTable('users', ['id', 'email'], {
		pks: [{ table: 'users', name: 'PRIMARY', columns: ['id'] }],
		fks: [mysqlForeignKey('users', ['id'], 'parent', ['id'])],
		indexes: [mysqlIndex('users', 'users_id_idx', ['id'])],
	});

	const state = mysqlState([parent, users]);
	const ddl1 = studioSchemaToDDLMysql(state);
	const ddl2 = studioSchemaToDDLMysql(state);

	ddl2.rename(ddl1.columns.one({ table: 'users', name: 'id' })!, {
		name: 'key',
	});

	const { sqlStatements } = await diffMySql(
		ddl1,
		ddl2,
		['users.id->users.key'],
	);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE `users` RENAME COLUMN `id` TO `key`;']);
});

test('mysql: a new index follows a renamed column', async () => {
	const state = mysqlState([mysqlTable('users', ['id'])]);
	const ddl1 = studioSchemaToDDLMysql(state);
	const ddl2 = studioSchemaToDDLMysql(state);

	ddl2.indexes.push(mysqlIndex('users', 'users_new_idx', ['id']));
	ddl2.rename(ddl1.columns.one({ table: 'users', name: 'id' })!, {
		name: 'key',
	});

	const { sqlStatements } = await diffMySql(
		ddl1,
		ddl2,
		['users.id->users.key'],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` RENAME COLUMN `id` TO `key`;',
		'CREATE INDEX `users_new_idx` ON `users` (`key`);',
	]);
});

test('mysql: a changed foreign key follows a renamed column of its table', async () => {
	const parent = mysqlTable('parent', ['id']);
	const foreignKey = mysqlForeignKey('users', ['id'], 'parent', ['id']);

	const state = mysqlState([parent, mysqlTable('users', ['id'], { fks: [foreignKey] })]);
	const ddl1 = studioSchemaToDDLMysql(state);
	const ddl2 = studioSchemaToDDLMysql(state);

	ddl2.fks.update({
		set: { onDelete: 'CASCADE' },
		where: foreignKey,
	});
	ddl2.rename(ddl1.columns.one({ table: 'users', name: 'id' })!, {
		name: 'key',
	});

	const { sqlStatements } = await diffMySql(
		ddl1,
		ddl2,
		['users.id->users.key'],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` DROP CONSTRAINT `users_parent_fk`;',
		'ALTER TABLE `users` RENAME COLUMN `id` TO `key`;',
		'ALTER TABLE `users` ADD CONSTRAINT `users_parent_fk` FOREIGN KEY (`key`) REFERENCES `parent`(`id`) ON DELETE CASCADE;',
	]);
});

test('mysql: a recreated foreign key of another table follows a renamed column', async () => {
	const child = mysqlTable('child', ['parentId'], { fks: [mysqlForeignKey('child', ['parentId'], 'parent', ['id'])] });

	const state = mysqlState([
		mysqlTable('parent', ['id', 'other'], { pks: [{ table: 'parent', name: 'PRIMARY', columns: ['id'] }] }),
		child,
	]);
	const ddl1 = studioSchemaToDDLMysql(state);
	const ddl2 = studioSchemaToDDLMysql(state);

	ddl2.pks.update({
		set: { columns: ['id', 'other'] },
		where: { table: 'parent', name: 'PRIMARY' },
	});
	ddl2.rename(ddl1.columns.one({ table: 'parent', name: 'id' })!, {
		name: 'key',
	});

	const { sqlStatements } = await diffMySql(
		ddl1,
		ddl2,
		['parent.id->parent.key'],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `child` DROP CONSTRAINT `child_parent_fk`;',
		'ALTER TABLE `parent` RENAME COLUMN `id` TO `key`;',
		'ALTER TABLE `parent` DROP PRIMARY KEY;',
		'ALTER TABLE `parent` ADD PRIMARY KEY (`key`,`other`);',
		'ALTER TABLE `child` ADD CONSTRAINT `child_parent_fk` FOREIGN KEY (`parentId`) REFERENCES `parent`(`key`);',
	]);
});

type SqliteTable = SqliteState['tables'][number];

const sqliteColumn = (table: string, name: string): SqliteTable['columns'][number] => ({
	table,
	name,
	type: 'integer',
	notNull: true,
	autoincrement: false,
	default: null,
	generated: null,
	pk: false,
	pkName: null,
	isUnique: false,
	uniqueName: null,
});

const sqliteForeignKey = (
	table: string,
	columns: string[],
	tableTo: string,
	columnsTo: string[],
): SqliteTable['fks'][number] => ({
	table,
	name: `${table}_${tableTo}_fk`,
	nameExplicit: true,
	columns,
	tableTo,
	columnsTo,
	onUpdate: 'NO ACTION',
	onDelete: 'NO ACTION',
});

const sqliteIndex = (table: string, name: string, columns: string[]): SqliteTable['indexes'][number] => ({
	table,
	name,
	columns: columns.map((value) => ({ value, isExpression: false })),
	isUnique: false,
	where: null,
	origin: 'manual',
});

const sqliteTable = (name: string, columns: string[], rest: Partial<SqliteTable> = {}): SqliteTable => ({
	name,
	columns: columns.map((column) => sqliteColumn(name, column)),
	pks: [],
	fks: [],
	uniques: [],
	checks: [],
	indexes: [],
	...rest,
});

const sqliteState = (tables: SqliteTable[]): SqliteState => ({ tables, views: [] });

test('sqlite: the constraints and the index of a table follow a renamed column', async () => {
	const parent = sqliteTable('parent', ['id']);
	const users = sqliteTable('users', ['id', 'email'], {
		pks: [{ table: 'users', name: 'users_pk', nameExplicit: true, columns: ['id'] }],
		uniques: [{ table: 'users', name: 'users_id_email_unique', nameExplicit: true, columns: ['id', 'email'] }],
		fks: [sqliteForeignKey('users', ['id'], 'parent', ['id'])],
		indexes: [sqliteIndex('users', 'users_id_idx', ['id'])],
	});

	const state = sqliteState([parent, users]);
	const ddl1 = studioSchemaToDDLSqlite(state);
	const ddl2 = studioSchemaToDDLSqlite(state);

	ddl2.rename(ddl1.columns.one({ table: 'users', name: 'id' })!, {
		name: 'key',
	});

	const { sqlStatements } = await diffSqlite(
		ddl1,
		ddl2,
		['users.id->users.key'],
	);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE `users` RENAME COLUMN `id` TO `key`;']);
});

test('sqlite: the foreign key of another table follows a renamed column', async () => {
	const parent = sqliteTable('parent', ['id']);
	const child = sqliteTable('child', ['parentId'], {
		fks: [sqliteForeignKey('child', ['parentId'], 'parent', ['id'])],
	});

	const state = sqliteState([parent, child]);
	const ddl1 = studioSchemaToDDLSqlite(state);
	const ddl2 = studioSchemaToDDLSqlite(state);

	ddl2.rename(ddl1.columns.one({ table: 'parent', name: 'id' })!, {
		name: 'key',
	});

	const { sqlStatements } = await diffSqlite(
		ddl1,
		ddl2,
		['parent.id->parent.key'],
	);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE `parent` RENAME COLUMN `id` TO `key`;']);
});

test('sqlite: the foreign key of another table follows a renamed table', async () => {
	const child = sqliteTable('child', ['parentId'], {
		fks: [sqliteForeignKey('child', ['parentId'], 'parent', ['id'])],
	});

	const state = sqliteState([sqliteTable('parent', ['id']), child]);
	const ddl1 = studioSchemaToDDLSqlite(state);
	const ddl2 = studioSchemaToDDLSqlite(state);

	ddl2.rename(ddl1.tables.one({ name: 'parent' })!, {
		name: 'owner',
	});

	const { sqlStatements } = await diffSqlite(
		ddl1,
		ddl2,
		['parent->owner'],
	);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE `parent` RENAME TO `owner`;']);
});

test('sqlite: a new index follows a renamed column', async () => {
	const state = sqliteState([sqliteTable('users', ['id'])]);
	const ddl1 = studioSchemaToDDLSqlite(state);
	const ddl2 = studioSchemaToDDLSqlite(state);

	ddl2.indexes.push(sqliteIndex('users', 'users_new_idx', ['id']));
	ddl2.rename(ddl1.columns.one({ table: 'users', name: 'id' })!, {
		name: 'key',
	});

	const { sqlStatements } = await diffSqlite(
		ddl1,
		ddl2,
		['users.id->users.key'],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `users` RENAME COLUMN `id` TO `key`;',
		'CREATE INDEX `users_new_idx` ON `users` (`key`);',
	]);
});
