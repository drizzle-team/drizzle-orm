import { SQL, sql } from 'drizzle-orm';
import { cockroachTable, int4, text } from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

test.concurrent('generated as callback: add column with generated constraint', async ({ db }) => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS (\"users\".\"name\" || 'hello') STORED;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('generated as callback: add generated constraint to an exisiting column', async ({ db }) => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs((): SQL => sql`${from.users.name} || 'to add'`),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS ("users"."name" || \'to add\') STORED;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('generated as callback: drop generated constraint', async ({ db }) => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name} || 'to delete'`,
			),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE \"users\" DROP COLUMN \"gen_name\";`,
		`ALTER TABLE \"users\" ADD COLUMN \"gen_name\" string;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('generated as callback: change generated constraint', async ({ db }) => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we don't trigger generated column recreate if definition change within push
});

test.concurrent('generated as sql: add column with generated constraint', async ({ db }) => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\" || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS (\"users\".\"name\" || 'hello') STORED;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('generated as sql: add generated constraint to an exisiting column', async ({ db }) => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`\"users\".\"name\" || 'to add'`),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS ("users"."name" || \'to add\') STORED;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('generated as sql: drop generated constraint', async ({ db }) => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\" || 'to delete'`,
			),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE \"users\" DROP COLUMN \"gen_name\";`,
		`ALTER TABLE \"users\" ADD COLUMN \"gen_name\" string;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('generated as sql: change generated constraint', async ({ db }) => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\"`,
			),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				sql`\"users\".\"name\" || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we don't trigger generated column recreate if definition change within push
});

test.concurrent('generated as string: add column with generated constraint', async ({ db }) => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\"users\".\"name\" || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS (\"users\".\"name\" || 'hello') STORED;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('generated as string: add generated constraint to an exisiting column', async ({ db }) => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').notNull(),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name')
				.notNull()
				.generatedAlwaysAs(`\"users\".\"name\" || 'to add'`),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS ("users"."name" || \'to add\') STORED;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('generated as string: drop generated constraint', async ({ db }) => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\"users\".\"name\" || 'to delete'`,
			),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName1: text('gen_name'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER TABLE \"users\" DROP COLUMN \"gen_name\";`,
		`ALTER TABLE \"users\" ADD COLUMN \"gen_name\" string;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('generated as string: change generated constraint', async ({ db }) => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs(
				`\"users\".\"name\" || 'hello'`,
			),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we don't trigger generated column recreate if definition change within push
});

test.concurrent('alter generated constraint', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema1.users.name}`),
		}),
	};
	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name} || 'hello'`),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE "users" DROP COLUMN "gen_name";',
		'ALTER TABLE "users" ADD COLUMN "gen_name" string GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED;',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // push ignores definition changes
});
