import 'dotenv/config';
import 'zx/globals';

import type { PrismaMySqlDatabase } from 'drizzle-orm/prisma/mysql';
import { drizzle } from 'drizzle-orm/prisma/mysql';
import { beforeAll, expect, test } from 'vitest';

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
	await db.insert(User).values({ email: 'test@test.com' });
	const result = await db.select().from(User);
	expect(result).toEqual([{ id: 1, email: 'test@test.com', name: null }]);
});
