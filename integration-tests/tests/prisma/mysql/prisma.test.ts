import 'dotenv/config';
import 'zx/globals';

import type { PrismaMySqlDatabase } from 'drizzle-orm/prisma/mysql';
import { drizzle } from 'drizzle-orm/prisma/mysql';
import { beforeAll, expect, expectTypeOf, test } from 'vitest';

import { PrismaClient } from './client';
import { User } from './drizzle/schema.ts';

const ENABLE_LOGGING = false;

let db: PrismaMySqlDatabase;

beforeAll(async () => {
	await $`prisma generate --schema tests/prisma/mysql/schema.prisma`.quiet();
	await $`prisma db push --force-reset --schema tests/prisma/mysql/schema.prisma`.quiet();
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
});
