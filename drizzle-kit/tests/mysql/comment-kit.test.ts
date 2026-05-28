import { comment as mysqlComment, int, mysqlTable, text } from 'drizzle-orm/mysql-core';
import { createDDL } from 'src/dialects/mysql/ddl';
import { ddlToTypeScript } from 'src/dialects/mysql/typescript';
import { describe, expect, test } from 'vitest';
import { diff } from './mocks';

describe('mysql comment kit tests', () => {
	test('column comment mapped to DDL', async () => {
		const schema = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey().comment('Primary key'),
			}),
		};
		const { next } = await diff({}, schema, []);
		const columns = next.columns.list({ table: 'users' });
		expect(columns[0].comment).toBe('Primary key');
	});

	test('table comment mapped to DDL', async () => {
		const schema = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
			}, () => [mysqlComment('Users table')]),
		};
		const { next } = await diff({}, schema, []);
		const table = next.tables.one({ name: 'users' });
		expect(table?.comment).toBe('Users table');
	});

	test('create table with column and table comments', async () => {
		const schema = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey().comment('Primary key'),
				name: text('name').notNull().comment('User name'),
			}, () => [mysqlComment('Users table')]),
		};
		const { sqlStatements } = await diff({}, schema, []);
		expect(sqlStatements).toStrictEqual([
			'CREATE TABLE `users` (\n'
			+ "\t`id` int AUTO_INCREMENT PRIMARY KEY COMMENT 'Primary key',\n"
			+ "\t`name` text NOT NULL COMMENT 'User name'\n"
			+ ") COMMENT='Users table';\n",
		]);
	});

	test('add column with comment', async () => {
		const s1 = { users: mysqlTable('users', { id: int('id').autoincrement().primaryKey() }) };
		const s2 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
				bio: text('bio').comment('User bio'),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			"ALTER TABLE `users` ADD `bio` text COMMENT 'User bio';",
		]);
	});

	test('modify column comment', async () => {
		const s1 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey().comment('Old comment'),
			}),
		};
		const s2 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey().comment('New comment'),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			"ALTER TABLE `users` MODIFY COLUMN `id` int AUTO_INCREMENT NOT NULL COMMENT 'New comment';",
		]);
	});

	test('drop column comment', async () => {
		const s1 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey().comment('Old comment'),
			}),
		};
		const s2 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			"ALTER TABLE `users` MODIFY COLUMN `id` int AUTO_INCREMENT NOT NULL COMMENT '';",
		]);
	});

	test('alter table comment', async () => {
		const s1 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
			}, () => [mysqlComment('Old table comment')]),
		};
		const s2 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
			}, () => [mysqlComment('New table comment')]),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			"ALTER TABLE `users` COMMENT='New table comment';",
		]);
	});

	test('drop table comment', async () => {
		const s1 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
			}, () => [mysqlComment('Table comment')]),
		};
		const s2 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			"ALTER TABLE `users` COMMENT='';",
		]);
	});

	test('comment with single quote escape', async () => {
		const schema = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey().comment("It's a user"),
			}),
		};
		const { sqlStatements } = await diff({}, schema, []);
		expect(sqlStatements[0]).toContain("COMMENT 'It''s a user'");
	});

	test('diff no break for tables without comment', async () => {
		const s1 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
				name: text('name').notNull(),
			}),
		};
		const s2 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
				name: text('name').notNull(),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([]);
	});

	test('diff column comment add modify drop', async () => {
		const s1 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
			}),
		};
		const s2 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey().comment('pk'),
			}),
		};
		const s3 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey().comment('primary key'),
			}),
		};
		const s4 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
			}),
		};

		const r1 = await diff(s1, s2, []);
		expect(r1.sqlStatements).toStrictEqual([
			"ALTER TABLE `users` MODIFY COLUMN `id` int AUTO_INCREMENT NOT NULL COMMENT 'pk';",
		]);

		const r2 = await diff(s2, s3, []);
		expect(r2.sqlStatements).toStrictEqual([
			"ALTER TABLE `users` MODIFY COLUMN `id` int AUTO_INCREMENT NOT NULL COMMENT 'primary key';",
		]);

		const r3 = await diff(s3, s4, []);
		expect(r3.sqlStatements).toStrictEqual([
			"ALTER TABLE `users` MODIFY COLUMN `id` int AUTO_INCREMENT NOT NULL COMMENT '';",
		]);
	});

	test('diff table comment add modify drop', async () => {
		const s1 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
			}),
		};
		const s2 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
			}, () => [mysqlComment('users table')]),
		};
		const s3 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
			}, () => [mysqlComment('app users table')]),
		};
		const s4 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
			}),
		};

		const r1 = await diff(s1, s2, []);
		expect(r1.sqlStatements).toStrictEqual([
			"ALTER TABLE `users` COMMENT='users table';",
		]);

		const r2 = await diff(s2, s3, []);
		expect(r2.sqlStatements).toStrictEqual([
			"ALTER TABLE `users` COMMENT='app users table';",
		]);

		const r3 = await diff(s3, s4, []);
		expect(r3.sqlStatements).toStrictEqual([
			"ALTER TABLE `users` COMMENT='';",
		]);
	});

	test('typescript generation does not import comment for column-only comments', () => {
		const ddl = createDDL();
		ddl.tables.push({ name: 'users', comment: null });
		ddl.columns.push({
			table: 'users',
			name: 'id',
			type: 'int',
			notNull: true,
			autoIncrement: true,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
			comment: 'pk',
		} as any);
		const file = ddlToTypeScript(ddl, [], 'camel', 'mysql');
		expect(file.imports).not.toContain('comment');
		expect(file.file).toContain('.comment("pk")');
	});

	test('typescript generation imports comment for table comments', () => {
		const ddl = createDDL();
		ddl.tables.push({ name: 'users', comment: 'users table' });
		ddl.columns.push({
			table: 'users',
			name: 'id',
			type: 'int',
			notNull: true,
			autoIncrement: true,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
			comment: null,
		} as any);
		const file = ddlToTypeScript(ddl, [], 'camel', 'mysql');
		expect(file.imports).toContain('comment');
		expect(file.file).toContain('comment("users table")');
	});

	test('typescript generation escapes special characters in comments', () => {
		const ddl = createDDL();
		ddl.tables.push({ name: 'users', comment: 'line1\nline2\r\t"slash"' });
		ddl.columns.push({
			table: 'users',
			name: 'id',
			type: 'int',
			notNull: true,
			autoIncrement: true,
			default: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
			charSet: null,
			collation: null,
			generated: null,
			comment: 'tab\there',
		} as any);
		const file = ddlToTypeScript(ddl, [], 'camel', 'mysql');
		expect(file.file).toContain('comment("line1\\nline2\\r\\t\\"slash\\"")');
		expect(file.file).toContain('.comment("tab\\there")');
	});

	test('diff is empty for empty string comment vs null', async () => {
		const s1 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey().comment(''),
			}),
		};
		const s2 = {
			users: mysqlTable('users', {
				id: int('id').autoincrement().primaryKey(),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([]);
	});
});
