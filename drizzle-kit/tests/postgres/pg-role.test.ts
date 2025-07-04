import { pgRole } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from '../postgres/mocks';

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

test('create role', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager'),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'CREATE ROLE "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create role with properties', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager', {
			superuser: true,
			createDb: true,
			createRole: true,
			inherit: false,
			canLogin: true,
			replication: true,
			bypassRls: true,
			connLimit: 1,
			password: 'secret',
			validUntil: new Date('1337-03-13T00:00:00.000Z'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		`CREATE ROLE "manager" WITH SUPERUSER CREATEDB CREATEROLE NOINHERIT LOGIN REPLICATION BYPASSRLS CONNECTION LIMIT 1 PASSWORD 'secret' VALID UNTIL '1337-03-13T00:00:00.000Z';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create role with some properties', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, inherit: false, replication: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'CREATE ROLE "manager" WITH CREATEDB NOINHERIT REPLICATION;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop role', async (t) => {
	const schema1 = { manager: pgRole('manager') };

	const schema2 = {};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'DROP ROLE "manager";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create and drop role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		admin: pgRole('admin'),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		entities: { roles: { include: ['manager', 'admin'] } },
	});

	const st0 = [
		'DROP ROLE "manager";',
		'CREATE ROLE "admin";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		admin: pgRole('admin'),
	};

	const renames = ['manager->admin'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames,
		entities: { roles: { include: ['manager', 'admin'] } },
	});

	const st0 = [
		'ALTER ROLE "manager" RENAME TO "admin";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter all role field', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', {
			superuser: true,
			createDb: true,
			createRole: true,
			inherit: false,
			canLogin: true,
			replication: true,
			bypassRls: true,
			connLimit: 1,
			password: 'secret',
			validUntil: new Date('1337-03-13T00:00:00.000Z'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		`ALTER ROLE "manager" WITH SUPERUSER CREATEDB CREATEROLE NOINHERIT LOGIN REPLICATION BYPASSRLS CONNECTION LIMIT 1 PASSWORD 'secret' VALID UNTIL '1337-03-13T00:00:00.000Z';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter superuser in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { superuser: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH SUPERUSER;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter createdb in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createDb: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH CREATEDB;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter createrole in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createRole: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH CREATEROLE;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter inherit in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { inherit: false }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH NOINHERIT;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter canLogin in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { canLogin: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH LOGIN;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter replication in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { replication: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH REPLICATION;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter bypassRls in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { bypassRls: true }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH BYPASSRLS;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter connLimit in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { connLimit: 1 }),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		'ALTER ROLE "manager" WITH CONNECTION LIMIT 1;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter password in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', {
			password: 'secret',
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);
	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });
	
	const st0 = [
		`ALTER ROLE "manager" WITH PASSWORD 'secret';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter validUntil in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', {
			validUntil: new Date('1337-03-13T00:00:00.000Z'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);
	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, entities: { roles: { include: ['manager'] } } });

	const st0 = [
		`ALTER ROLE "manager" WITH VALID UNTIL '1337-03-13T00:00:00.000Z';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
