import { sql } from 'drizzle-orm';
import { cockroachPolicy, cockroachRole } from 'drizzle-orm/cockroach-core';
import { pgPolicy, pgRole } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';

test.each([pgPolicy, cockroachPolicy])('empty policy configuration omits optional properties', (policy) => {
	for (const value of [policy('read_access'), policy('read_access', {})]) {
		for (const key of ['as', 'for', 'to', 'using', 'withCheck']) {
			expect(Object.hasOwn(value, key)).toBe(false);
		}
	}
});

test.each([pgRole, cockroachRole])('empty role configuration omits optional properties', (role) => {
	for (const value of [role('reader'), role('reader', {})]) {
		for (const key of ['createDb', 'createRole', 'inherit']) {
			expect(Object.hasOwn(value, key)).toBe(false);
		}
	}
});

test('PostgreSQL policy preserves every supplied configuration value', () => {
	const using = sql`true`, withCheck = sql`false`;
	const role = pgRole('reader');
	const policy = pgPolicy('read_access', { as: 'restrictive', for: 'select', to: role, using, withCheck });
	expect(policy.as).toBe('restrictive');
	expect(policy.for).toBe('select');
	expect(policy.to).toBe(role);
	expect(policy.using).toBe(using);
	expect(policy.withCheck).toBe(withCheck);
});

test('Cockroach policy preserves every supplied configuration value', () => {
	const using = sql`true`, withCheck = sql`false`;
	const role = cockroachRole('reader');
	const policy = cockroachPolicy('read_access', { as: 'restrictive', for: 'select', to: role, using, withCheck });
	expect(policy.as).toBe('restrictive');
	expect(policy.for).toBe('select');
	expect(policy.to).toBe(role);
	expect(policy.using).toBe(using);
	expect(policy.withCheck).toBe(withCheck);
});

test('false role flags are retained', () => {
	expect(pgRole('reader', { createDb: false, createRole: false, inherit: false })).toMatchObject({
		createDb: false,
		createRole: false,
		inherit: false,
	});
	expect(cockroachRole('reader', { createDb: false, createRole: false })).toMatchObject({
		createDb: false,
		createRole: false,
	});
});
