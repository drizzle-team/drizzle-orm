// drizzle-orm/postgres memoizes the driver shape of plain selections per drizzle instance, so a query
// builder created per call hands the driver the SAME shape object (the driver caches its decode plan by
// that identity). The shape must still change with anything that changes decoding.
import { expect, test } from 'vitest';
import { eq, sql } from '~/index.ts';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { drizzle } from '~/postgres/index.ts';
import { buildShape } from '~/postgres/shape.ts';

const users = pgTable('users', { id: integer().primaryKey(), name: text().notNull(), orgId: integer() });
const orgs = pgTable('orgs', { id: integer().primaryKey(), name: text().notNull() });

const shapeOf = (query: unknown) => (query as { _prepare(): { shape: unknown } })._prepare().shape;

test('the same selection from new builders returns the same shape object', () => {
	const db = drizzle.mock();
	const a = shapeOf(db.select().from(users));
	expect(shapeOf(db.select().from(users).where(eq(users.id, 1)))).toBe(a);
	expect(a).toEqual(buildShape({ type: 'plain', fields: (db.select().from(users) as any)._resolveSelection() }));
	const partial = () => db.select({ id: users.id, name: users.name }).from(users);
	expect(shapeOf(partial())).toBe(shapeOf(partial()));
	expect(shapeOf(partial())).not.toBe(a);
});

test('keys, nesting and join nullability each give their own shape', () => {
	const db = drizzle.mock();
	const flat = shapeOf(db.select({ a: users.id }).from(users));
	expect(shapeOf(db.select({ b: users.id }).from(users))).not.toBe(flat);
	expect(shapeOf(db.select({ a: { b: users.id } }).from(users))).not.toBe(flat);
	const left = shapeOf(db.select().from(users).leftJoin(orgs, eq(orgs.id, users.orgId)));
	const inner = shapeOf(db.select().from(users).innerJoin(orgs, eq(orgs.id, users.orgId)));
	expect(inner).not.toBe(left);
	expect(shapeOf(db.select().from(users).leftJoin(orgs, eq(orgs.id, users.orgId)))).toBe(left);
});

test('sql fields: a shared decoder hits, an inline mapWith function does not', () => {
	const db = drizzle.mock();
	const count = () => db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(users);
	expect(shapeOf(count())).toBe(shapeOf(count()));
	const inline = () => db.select({ n: sql`count(*)`.mapWith((v) => Number(v) + 1) }).from(users);
	expect(shapeOf(inline())).not.toBe(shapeOf(inline()));
});

test('each drizzle instance has its own memo', () => {
	expect(shapeOf(drizzle.mock().select().from(users))).not.toBe(shapeOf(drizzle.mock().select().from(users)));
});
