import { cockroachTable, int4 } from 'drizzle-orm/cockroach-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

// These tests only exercise the pure (DB-free) diff path, so they don't require a CockroachDB instance.

test('create table with replica identity full', async () => {
	const to = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}).replicaIdentity('full'),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	expect(st.at(-1)).toBe('ALTER TABLE "users" REPLICA IDENTITY FULL;');
});

test('alter replica identity default -> full', async () => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const to = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}).replicaIdentity('full'),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	expect(st).toStrictEqual(['ALTER TABLE "users" REPLICA IDENTITY FULL;']);
});

test('alter replica identity full -> nothing', async () => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}).replicaIdentity('full'),
	};

	const to = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}).replicaIdentity('nothing'),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	expect(st).toStrictEqual(['ALTER TABLE "users" REPLICA IDENTITY NOTHING;']);
});

test('alter replica identity full -> default (reset)', async () => {
	const from = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}).replicaIdentity('full'),
	};

	const to = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	expect(st).toStrictEqual(['ALTER TABLE "users" REPLICA IDENTITY DEFAULT;']);
});
