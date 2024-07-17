import 'dotenv/config';
import 'zx/globals';

import { drizzle } from 'drizzle-orm/prisma/sqlite';
import type { PrismaSQLiteDatabase } from 'drizzle-orm/prisma/sqlite';
import { beforeAll, expect, expectTypeOf, test } from 'vitest';

import { PrismaClient } from './client';
import { User } from './drizzle/schema.ts';

const ENABLE_LOGGING = false;

let db: PrismaSQLiteDatabase;

beforeAll(async () => {
	await $`prisma db push --force-reset --schema tests/prisma/sqlite/schema.prisma`.quiet();
	const prisma = new PrismaClient().$extends(drizzle({ logger: ENABLE_LOGGING }));
	db = prisma.$drizzle;
});

test('extension works', async () => {
	const insert = await db.insert(User).values({ email: 'test@test.com' });
	expectTypeOf(insert).toEqualTypeOf<[]>();
	expect(insert).toEqual([]);

	const result = await db.select().from(User);
	expectTypeOf(result).toEqualTypeOf<typeof User.$inferSelect[]>();
	expect(result).toEqual([{ id: 1, email: 'test@test.com', name: null }]);

	const all = await db.select().from(User).all();
	expectTypeOf(all).toEqualTypeOf<typeof User.$inferSelect[]>();
	expect(all).toEqual([{ id: 1, email: 'test@test.com', name: null }]);

	const get = await db.select().from(User).get();
	expectTypeOf(get).toEqualTypeOf<typeof User.$inferSelect | undefined>();
	expect(get).toEqual({ id: 1, email: 'test@test.com', name: null });

	const run = await db.insert(User).values({ email: 'test2@test.com' }).run();
	expectTypeOf(run).toEqualTypeOf<[]>();
	expect(run).toEqual([]);
});
