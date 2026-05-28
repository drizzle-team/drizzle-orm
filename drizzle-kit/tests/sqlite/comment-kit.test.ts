import { comment as sqliteComment, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createDDL } from 'src/dialects/sqlite/ddl';
import { ddlToTypeScript } from 'src/dialects/sqlite/typescript';
import { describe, expect, test } from 'vitest';
import { diff } from './mocks';

describe('sqlite comment kit tests', () => {
	test('column comment mapped to DDL', async () => {
		const schema = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }).comment('Primary key'),
			}),
		};
		const { next } = await diff({}, schema, []);
		const columns = next.columns.list({ table: 'users' });
		expect(columns[0].comment).toBe('Primary key');
	});

	test('table comment mapped to DDL', async () => {
		const schema = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
			}, () => [sqliteComment('Users table')]),
		};
		const { next } = await diff({}, schema, []);
		const table = next.tables.one({ name: 'users' });
		expect(table?.comment).toBe('Users table');
	});

	test('create table with column and table comments - no comment SQL', async () => {
		const schema = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }).comment('Primary key'),
				name: text('name').notNull().comment('User name'),
			}, () => [sqliteComment('Users table')]),
		};
		const { sqlStatements } = await diff({}, schema, []);
		expect(sqlStatements).toStrictEqual([
			'CREATE TABLE `users` (\n'
			+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
			+ '\t`name` text NOT NULL\n'
			+ ');\n',
		]);
	});

	test('add column with comment - no comment SQL', async () => {
		const s1 = { users: sqliteTable('users', { id: int('id').primaryKey({ autoIncrement: true }) }) };
		const s2 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
				bio: text('bio').comment('User bio'),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE `users` ADD `bio` text;',
		]);
	});

	test('modify column comment - no SQL diff', async () => {
		const s1 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }).comment('Old comment'),
			}),
		};
		const s2 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }).comment('New comment'),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([]);
	});

	test('drop column comment - no SQL diff', async () => {
		const s1 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }).comment('Old comment'),
			}),
		};
		const s2 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([]);
	});

	test('alter table comment - no SQL diff', async () => {
		const s1 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
			}, () => [sqliteComment('Old table comment')]),
		};
		const s2 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
			}, () => [sqliteComment('New table comment')]),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([]);
	});

	test('drop table comment - no SQL diff', async () => {
		const s1 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
			}, () => [sqliteComment('Table comment')]),
		};
		const s2 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([]);
	});

	test('diff no break for tables without comment', async () => {
		const s1 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
				name: text('name').notNull(),
			}),
		};
		const s2 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
				name: text('name').notNull(),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([]);
	});

	test('typescript generation with comments', async () => {
		const ddl = createDDL();
		ddl.tables.push({ name: 'users', comment: 'Users table' });
		ddl.columns.push({
			table: 'users',
			name: 'id',
			type: 'integer',
			notNull: true,
			autoincrement: true,
			default: null,
			generated: null,
			comment: 'Primary key',
		});
		ddl.pks.push({ table: 'users', name: 'users_pk', columns: ['id'], nameExplicit: true });

		const { file } = ddlToTypeScript(ddl, 'preserve', {}, 'sqlite');
		expect(file).toContain('comment("Users table")');
		expect(file).toContain('.comment("Primary key")');
		expect(file).toContain('import { sqliteTable, comment, integer');
		expect(file).toContain('from "drizzle-orm/sqlite-core"');
	});

	test('typescript generation does not import comment for column-only comments', () => {
		const ddl = createDDL();
		ddl.tables.push({ name: 'users', comment: null });
		ddl.columns.push({
			table: 'users',
			name: 'id',
			type: 'integer',
			notNull: true,
			autoincrement: true,
			default: null,
			generated: null,
			comment: 'pk',
		});
		const { file } = ddlToTypeScript(ddl, 'preserve', {}, 'sqlite');
		expect(file).toContain('.comment("pk")');
		expect(file).not.toContain('import { sqliteTable, comment, integer');
		expect(file).toContain('import { sqliteTable, integer');
	});

	test('typescript generation imports comment for table comments', () => {
		const ddl = createDDL();
		ddl.tables.push({ name: 'users', comment: 'users table' });
		ddl.columns.push({
			table: 'users',
			name: 'id',
			type: 'integer',
			notNull: true,
			autoincrement: true,
			default: null,
			generated: null,
			comment: null,
		});
		const { file } = ddlToTypeScript(ddl, 'preserve', {}, 'sqlite');
		expect(file).toContain('comment("users table")');
		expect(file).toContain('import { sqliteTable, comment');
	});

	test('typescript generation escapes special characters in comments', () => {
		const ddl = createDDL();
		ddl.tables.push({ name: 'users', comment: 'line1\nline2\r\t"slash"' });
		ddl.columns.push({
			table: 'users',
			name: 'id',
			type: 'integer',
			notNull: true,
			autoincrement: true,
			default: null,
			generated: null,
			comment: 'tab\there',
		});
		const { file } = ddlToTypeScript(ddl, 'preserve', {}, 'sqlite');
		expect(file).toContain('comment("line1\\nline2\\r\\t\\"slash\\"")');
		expect(file).toContain('.comment("tab\\there")');
	});

	test('diff column comment add modify drop all ignored', async () => {
		const s1 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
			}),
		};
		const s2 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }).comment('pk'),
			}),
		};
		const s3 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }).comment('primary key'),
			}),
		};
		const s4 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
			}),
		};

		const r1 = await diff(s1, s2, []);
		expect(r1.sqlStatements).toStrictEqual([]);

		const r2 = await diff(s2, s3, []);
		expect(r2.sqlStatements).toStrictEqual([]);

		const r3 = await diff(s3, s4, []);
		expect(r3.sqlStatements).toStrictEqual([]);
	});

	test('diff table comment add modify drop all ignored', async () => {
		const s1 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
			}),
		};
		const s2 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
			}, () => [sqliteComment('users table')]),
		};
		const s3 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
			}, () => [sqliteComment('app users table')]),
		};
		const s4 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
			}),
		};

		const r1 = await diff(s1, s2, []);
		expect(r1.sqlStatements).toStrictEqual([]);

		const r2 = await diff(s2, s3, []);
		expect(r2.sqlStatements).toStrictEqual([]);

		const r3 = await diff(s3, s4, []);
		expect(r3.sqlStatements).toStrictEqual([]);
	});

	test('concurrent comment and real column change', async () => {
		const s1 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }).comment('pk'),
				name: text('name').comment('optional name'),
			}),
		};
		const s2 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }).comment('primary key'),
				name: text('name').notNull().comment('required name'),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_users` (\n'
			+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
			+ '\t`name` text NOT NULL\n'
			+ ');\n',
			'INSERT INTO `__new_users`(`id`, `name`) SELECT `id`, `name` FROM `users`;',
			'DROP TABLE `users`;',
			'ALTER TABLE `__new_users` RENAME TO `users`;',
			'PRAGMA foreign_keys=ON;',
		]);
	});

	test('empty string comment is preserved in DDL and TypeScript', async () => {
		const schema = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }).comment(''),
			}, () => [sqliteComment('')]),
		};
		const { next } = await diff({}, schema, []);
		const columns = next.columns.list({ table: 'users' });
		expect(columns[0].comment).toBe('');
		const table = next.tables.one({ name: 'users' });
		expect(table?.comment).toBe('');

		const ddl = createDDL();
		ddl.tables.push({ name: 'users', comment: '' });
		ddl.columns.push({
			table: 'users',
			name: 'id',
			type: 'integer',
			notNull: true,
			autoincrement: true,
			default: null,
			generated: null,
			comment: '',
		});
		ddl.pks.push({ table: 'users', name: 'users_pk', columns: ['id'], nameExplicit: true });

		const { file } = ddlToTypeScript(ddl, 'preserve', {}, 'sqlite');
		expect(file).toContain('comment("")');
		expect(file).toContain('.comment("")');
	});
});
