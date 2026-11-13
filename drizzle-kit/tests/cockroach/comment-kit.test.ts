import { sql } from 'drizzle-orm';
import { cockroachTable, comment as crComment, int4, text } from 'drizzle-orm/cockroach-core';
import { createDDL } from 'src/dialects/cockroach/ddl';
import { ddlToTypeScript } from 'src/dialects/cockroach/typescript';
import { describe, expect, test } from 'vitest';
import { diff } from './mocks';

describe('cockroach comment kit tests', () => {
	test('column comment mapped to DDL', async () => {
		const schema = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment('Primary key'),
			}),
		};
		const { next } = await diff({}, schema, []);
		const columns = next.columns.list({ table: 'users' });
		expect(columns[0].comment).toBe('Primary key');
	});

	test('table comment mapped to DDL', async () => {
		const schema = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
			}, () => [crComment('Users table')]),
		};
		const { next } = await diff({}, schema, []);
		const table = next.tables.one({ schema: 'public', name: 'users' });
		expect(table?.comment).toBe('Users table');
	});

	test('create table with column and table comments', async () => {
		const schema = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment('Primary key'),
				name: text('name').notNull().comment('User name'),
			}, () => [crComment('Users table')]),
		};
		const { sqlStatements } = await diff({}, schema, []);
		expect(sqlStatements).toStrictEqual([
			'CREATE TABLE "users" (\n'
			+ '\t"id" int4 PRIMARY KEY,\n'
			+ '\t"name" string NOT NULL\n'
			+ ');\n',
			'COMMENT ON TABLE "users" IS \'Users table\';',
			'COMMENT ON COLUMN "users"."id" IS \'Primary key\';',
			'COMMENT ON COLUMN "users"."name" IS \'User name\';',
		]);
	});

	test('add column with comment', async () => {
		const s1 = { users: cockroachTable('users', { id: int4('id').primaryKey() }) };
		const s2 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
				bio: text('bio').comment('User bio'),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE "users" ADD COLUMN "bio" string;',
			'COMMENT ON COLUMN "users"."bio" IS \'User bio\';',
		]);
	});

	test('modify column comment', async () => {
		const s1 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment('Old comment'),
			}),
		};
		const s2 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment('New comment'),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			'COMMENT ON COLUMN "users"."id" IS \'New comment\';',
		]);
	});

	test('drop column comment', async () => {
		const s1 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment('Old comment'),
			}),
		};
		const s2 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			'COMMENT ON COLUMN "users"."id" IS NULL;',
		]);
	});

	test('alter table comment', async () => {
		const s1 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
			}, () => [crComment('Old table comment')]),
		};
		const s2 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
			}, () => [crComment('New table comment')]),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			'COMMENT ON TABLE "users" IS \'New table comment\';',
		]);
	});

	test('drop table comment', async () => {
		const s1 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
			}, () => [crComment('Table comment')]),
		};
		const s2 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			'COMMENT ON TABLE "users" IS NULL;',
		]);
	});

	test('comment with single quote escape', async () => {
		const schema = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment("It's a user"),
			}),
		};
		const { sqlStatements } = await diff({}, schema, []);
		expect(sqlStatements).toContain('COMMENT ON COLUMN "users"."id" IS \'It\'\'s a user\';');
	});

	test('diff no break for tables without comment', async () => {
		const s1 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
			}),
		};
		const s2 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([]);
	});

	test('diff column comment add modify drop', async () => {
		const s1 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
			}),
		};
		const s2 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment('pk'),
			}),
		};
		const s3 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment('primary key'),
			}),
		};
		const s4 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
			}),
		};

		const r1 = await diff(s1, s2, []);
		expect(r1.sqlStatements).toStrictEqual([
			'COMMENT ON COLUMN "users"."id" IS \'pk\';',
		]);

		const r2 = await diff(s2, s3, []);
		expect(r2.sqlStatements).toStrictEqual([
			'COMMENT ON COLUMN "users"."id" IS \'primary key\';',
		]);

		const r3 = await diff(s3, s4, []);
		expect(r3.sqlStatements).toStrictEqual([
			'COMMENT ON COLUMN "users"."id" IS NULL;',
		]);
	});

	test('diff table comment add modify drop', async () => {
		const s1 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
			}),
		};
		const s2 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
			}, () => [crComment('users table')]),
		};
		const s3 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
			}, () => [crComment('application users table')]),
		};
		const s4 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
			}),
		};

		const r1 = await diff(s1, s2, []);
		expect(r1.sqlStatements).toStrictEqual([
			'COMMENT ON TABLE "users" IS \'users table\';',
		]);

		const r2 = await diff(s2, s3, []);
		expect(r2.sqlStatements).toStrictEqual([
			'COMMENT ON TABLE "users" IS \'application users table\';',
		]);

		const r3 = await diff(s3, s4, []);
		expect(r3.sqlStatements).toStrictEqual([
			'COMMENT ON TABLE "users" IS NULL;',
		]);
	});

	test('comment with schema prefix', async () => {
		const schema = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment('Primary key'),
			}, () => [crComment('Users table')]),
		};
		const { sqlStatements } = await diff({}, schema, []);
		expect(sqlStatements).toContain('COMMENT ON TABLE "users" IS \'Users table\';');
		expect(sqlStatements).toContain('COMMENT ON COLUMN "users"."id" IS \'Primary key\';');
	});

	test('generated column with comment', async () => {
		const s1 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
			}),
		};
		const s2 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
				gen_name: text('gen_name').generatedAlwaysAs(sql`"users"."name" || 'hello'`).comment('Generated name'),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED;',
			'COMMENT ON COLUMN "users"."gen_name" IS \'Generated name\';',
		]);
	});

	test('typescript generation with comments', async () => {
		const ddl = createDDL();
		ddl.tables.push({ schema: 'public', name: 'users', isRlsEnabled: false, comment: 'Users table' });
		ddl.columns.push({
			schema: 'public',
			table: 'users',
			name: 'id',
			type: 'int4',
			typeSchema: null,
			dimensions: 0,
			default: null,
			notNull: true,
			generated: null,
			identity: null,
			comment: 'Primary key',
		});
		ddl.pks.push({ schema: 'public', table: 'users', name: 'users_pkey', columns: ['id'], nameExplicit: true });

		const { file } = ddlToTypeScript(ddl, [], 'preserve');
		expect(file).toContain('comment("Users table")');
		expect(file).toContain('.comment("Primary key")');
		expect(file).toContain('import { cockroachTable, comment, int4');
		expect(file).toContain('from "drizzle-orm/cockroach-core"');
	});

	test('empty string comment', async () => {
		const schema = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment(''),
			}),
		};
		const { sqlStatements } = await diff({}, schema, []);
		expect(sqlStatements).toContain('COMMENT ON COLUMN "users"."id" IS \'\';');
	});

	test('comment with newline', async () => {
		const schema = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment('line1\nline2'),
			}),
		};
		const { sqlStatements } = await diff({}, schema, []);
		expect(sqlStatements).toContain('COMMENT ON COLUMN "users"."id" IS \'line1\nline2\';');
	});

	test('comment with unicode', async () => {
		const schema = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment('日本語'),
			}),
		};
		const { sqlStatements } = await diff({}, schema, []);
		expect(sqlStatements).toContain('COMMENT ON COLUMN "users"."id" IS \'日本語\';');
	});

	test('concurrent comment and notNull change', async () => {
		const s1 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment('pk'),
				name: text('name').comment('optional name'),
			}),
		};
		const s2 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey().comment('primary key'),
				name: text('name').notNull().comment('required name'),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toContain('ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;');
		expect(sqlStatements).toContain('COMMENT ON COLUMN "users"."id" IS \'primary key\';');
		expect(sqlStatements).toContain('COMMENT ON COLUMN "users"."name" IS \'required name\';');
	});

	test('recreate generated column with comment', async () => {
		const s1 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
				gen_name: text('gen_name').generatedAlwaysAs(sql`"users"."name" || 'hello'`).comment('Generated name'),
			}),
		};
		const s2 = {
			users: cockroachTable('users', {
				id: int4('id').primaryKey(),
				name: text('name').notNull(),
				gen_name: text('gen_name').generatedAlwaysAs(sql`"users"."name" || 'world'`).comment('Updated generated name'),
			}),
		};
		const { sqlStatements } = await diff(s1, s2, []);
		expect(sqlStatements).toContain('ALTER TABLE "users" DROP COLUMN "gen_name";');
		expect(sqlStatements).toContain(
			'ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS ("users"."name" || \'world\') STORED;',
		);
		expect(sqlStatements).toContain('COMMENT ON COLUMN "users"."gen_name" IS \'Updated generated name\';');
	});
});
