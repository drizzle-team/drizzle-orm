import { comment as singlestoreComment, int, serial, singlestoreTable, text } from 'drizzle-orm/singlestore-core';
import { createDDL } from 'src/dialects/mysql/ddl';
import { ddlToTypeScript } from 'src/dialects/mysql/typescript';
import { describe, expect, test } from 'vitest';
import { diff } from './mocks';

describe('singlestore comment kit tests', () => {
	test('create table with column and table comments', async () => {
		const schema = {
			users: singlestoreTable('users', {
				id: serial('id').primaryKey().comment('Primary key'),
				name: text('name').notNull().comment('User name'),
			}, () => [singlestoreComment('Users table')]),
		};
		const { sqlStatements } = await diff({}, schema, []);
		expect(sqlStatements).toStrictEqual([
			'CREATE TABLE `users` (\n'
			+ "\t`id` serial PRIMARY KEY COMMENT 'Primary key',\n"
			+ "\t`name` text NOT NULL COMMENT 'User name'\n"
			+ ") COMMENT='Users table';\n",
		]);
	});

	test('add column with comment', async () => {
		const s1 = { users: singlestoreTable('users', { id: serial('id').primaryKey() }) };
		const s2 = {
			users: singlestoreTable('users', {
				id: serial('id').primaryKey(),
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
			users: singlestoreTable('users', {
				id: serial('id').primaryKey().comment('Old comment'),
			}),
		};
		const s2 = {
			users: singlestoreTable('users', {
				id: serial('id').primaryKey().comment('New comment'),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			"ALTER TABLE `users` MODIFY COLUMN `id` serial AUTO_INCREMENT NOT NULL COMMENT 'New comment';",
		]);
	});

	test('typescript generation with column and table comments', async () => {
		const ddl = createDDL();
		ddl.tables.push({ name: 'users', comment: 'Users table' });
		ddl.columns.push({
			table: 'users',
			name: 'id',
			type: 'serial',
			default: null,
			notNull: true,
			autoIncrement: true,
			comment: 'Primary key',
			charSet: null,
			collation: null,
			generated: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
		});
		ddl.columns.push({
			table: 'users',
			name: 'name',
			type: 'text',
			default: null,
			notNull: true,
			autoIncrement: false,
			comment: 'User name',
			charSet: null,
			collation: null,
			generated: null,
			onUpdateNow: false,
			onUpdateNowFsp: null,
		});
		ddl.pks.push({
			name: 'users_pk',
			table: 'users',
			columns: ['id'],
		});
		const ts = ddlToTypeScript(ddl, [], 'camel', 'singlestore');
		expect(ts.file).toContain('import { signlestoreTable');
		expect(ts.file).toContain('comment');
		expect(ts.file).toContain('serial');
		expect(ts.file).toContain('text');
		expect(ts.file).toContain('drizzle-orm/singlestore-core');
		expect(ts.file).toContain('comment("Users table"),');
		expect(ts.file).toContain('.comment("Primary key")');
		expect(ts.file).toContain('.comment("User name")');
	});
});
