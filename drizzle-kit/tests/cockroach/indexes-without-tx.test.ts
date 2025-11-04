import { cockroachTable, index, int4, vector } from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

test('vector index', async ({ db }) => {
	const schema1 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			name: vector('name', { dimensions: 3 }),
		}),
	};

	const schema2 = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
			embedding: vector('name', { dimensions: 3 }),
		}, (t) => [
			index('vector_embedding_idx')
				.using('cspann', t.embedding),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0 = [
		`CREATE INDEX "vector_embedding_idx" ON "users" USING cspann ("name");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
