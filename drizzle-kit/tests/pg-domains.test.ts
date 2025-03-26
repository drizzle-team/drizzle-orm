import { sql } from 'drizzle-orm';
import {
	check,
	integer,
	numeric,
	pgDomain,
	pgEnum,
	pgSchema,
	pgTable,
	serial,
	text,
	varchar,
} from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('domains #1 create domain simple', async () => {
	const to = {
		domain: pgDomain('domain', text()),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE DOMAIN "public"."domain" AS text;`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_domain',
		name: 'domain',
		schema: 'public',
		baseType: 'text',
		notNull: false,
		defaultValue: undefined,
		checkConstraints: [],
	});
});

test('domains #2 create domain not null', async () => {
	const folder = pgSchema('folder');
	const to = {
		domain: folder.domain('domain', varchar({ length: 256 }).notNull()),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE DOMAIN "folder"."domain" AS varchar(256) NOT NULL;`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_domain',
		name: 'domain',
		schema: 'folder',
		baseType: 'varchar(256)',
		notNull: true,
		defaultValue: undefined,
		checkConstraints: [],
	});
});

test('domains #3 drop domain simple', async () => {
	const from = {
		domain: pgDomain('domain', numeric()),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, {}, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP DOMAIN "public"."domain" CASCADE;`);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'drop_domain',
		name: 'domain',
		schema: 'public',
	});
});

test('domains #4 create domain with constraint', async () => {
	const to = {
		domain: pgDomain('domain', text().checkConstraint('custom_check', sql`VALUE ~ '^[A-Za-z]+$'`)),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`CREATE DOMAIN "public"."domain" AS text CONSTRAINT custom_check CHECK (VALUE ~ '^[A-Za-z]+$');`,
	);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_domain',
		name: 'domain',
		schema: 'public',
		baseType: 'text',
		notNull: false,
		defaultValue: undefined,
		checkConstraints: [
			"custom_check;VALUE ~ '^[A-Za-z]+$'",
		],
	});
});

test('domains #5 create domain with default value', async () => {
	const to = {
		domain: pgDomain('domain', integer().default(42)),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`CREATE DOMAIN "public"."domain" AS integer DEFAULT '42';`,
	);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_domain',
		name: 'domain',
		schema: 'public',
		baseType: 'integer',
		notNull: false,
		defaultValue: 42,
		checkConstraints: [],
	});
});

test('domains #6 alter domain to add constraint', async () => {
	const from = {
		domain: pgDomain('domain', text()),
	};

	const to = {
		domain: pgDomain('domain', text().checkConstraint('custom_check', sql`VALUE ~ '^[A-Za-z]+$'`)),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER DOMAIN "public"."domain" ADD CONSTRAINT custom_check CHECK (VALUE ~ '^[A-Za-z]+$');`,
	);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_domain',
		name: 'domain',
		schema: 'public',
		action: 'add_constraint',
		checkConstraints: [
			"custom_check;VALUE ~ '^[A-Za-z]+$'",
		],
	});
});

test('domains #7 alter domain to drop constraint', async () => {
	const from = {
		domain: pgDomain('domain', text().checkConstraint('domain_check', sql`VALUE ~ '^[A-Za-z]+$'`)),
	};

	const to = {
		domain: pgDomain('domain', text()),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER DOMAIN "public"."domain" DROP CONSTRAINT domain_check;`,
	);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_domain',
		name: 'domain',
		schema: 'public',
		action: 'drop_constraint',
		checkConstraints: [
			"domain_check;VALUE ~ '^[A-Za-z]+$'",
		],
	});
});

test('domains #8 alter domain to set not null', async () => {
	const from = {
		domain: pgDomain('domain', text()),
	};

	const to = {
		domain: pgDomain('domain', text().notNull()),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER DOMAIN "public"."domain" SET NOT NULL;`,
	);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_domain',
		name: 'domain',
		schema: 'public',
		action: 'set_not_null',
		checkConstraints: [],
		defaultValue: undefined,
	});
});

test('domains #9 alter domain to drop not null', async () => {
	const from = {
		domain: pgDomain('domain', text().notNull()),
	};

	const to = {
		domain: pgDomain('domain', text()),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER DOMAIN "public"."domain" DROP NOT NULL;`,
	);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_domain',
		name: 'domain',
		schema: 'public',
		action: 'drop_not_null',
		checkConstraints: [],
		defaultValue: undefined,
	});
});

test('domains #10 alter domain to set default value', async () => {
	const from = {
		domain: pgDomain('domain', text()),
	};

	const to = {
		domain: pgDomain('domain', text().default('default_value')),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER DOMAIN "public"."domain" SET DEFAULT default_value;`,
	);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_domain',
		name: 'domain',
		schema: 'public',
		action: 'set_default',
		defaultValue: 'default_value',
		checkConstraints: [],
	});
});

test('domains #11 alter domain to drop default value', async () => {
	const from = {
		domain: pgDomain('domain', text().default('default_value')),
	};

	const to = {
		domain: pgDomain('domain', text()),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER DOMAIN "public"."domain" DROP DEFAULT;`,
	);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_domain',
		name: 'domain',
		schema: 'public',
		action: 'drop_default',
		checkConstraints: [],
		defaultValue: undefined,
	});
});

test('domains #12 create domain with unnamed constraint', async () => {
	const to = {
		domain: pgDomain('domain', text().checkConstraint(sql`VALUE ~ '^[A-Za-z]+$'`)),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`CREATE DOMAIN "public"."domain" AS text CHECK (VALUE ~ '^[A-Za-z]+$');`,
	);
	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_domain',
		name: 'domain',
		schema: 'public',
		baseType: 'text',
		notNull: false,
		defaultValue: undefined,
		checkConstraints: [
			";VALUE ~ '^[A-Za-z]+$'",
		],
	});
});
