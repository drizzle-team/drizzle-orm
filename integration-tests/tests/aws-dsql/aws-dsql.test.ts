import { sql } from 'drizzle-orm';
import { getMigrationStatus, migrate } from 'drizzle-orm/aws-dsql';
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { describe, expect } from 'vitest';
import { tests } from './common';
import { awsDsqlTest as test } from './instrumentation';

// Run common tests
tests(test);

describe('dsql-specific: transactions', () => {
	test('transaction commit', async ({ db, push }) => {
		const users = pgTable('tx_users_1', {
			id: uuid('id').primaryKey().defaultRandom(),
			name: text('name').notNull(),
		});

		await push({ users });

		await db.transaction(async (tx) => {
			await tx.insert(users).values({ name: 'John' });
			await tx.insert(users).values({ name: 'Jane' });
		});

		const result = await db.select().from(users);
		expect(result.length).toBe(2);
	});

	test('transactionWithRetry commits on success', async ({ db, push }) => {
		const accounts = pgTable('tx_retry_accounts_1', {
			id: integer('id').primaryKey(),
			balance: integer('balance').notNull(),
		});

		await push({ accounts });

		await db.transactionWithRetry(async (tx) => {
			await tx.insert(accounts).values({ id: 1, balance: 100 });
			await tx.insert(accounts).values({ id: 2, balance: 200 });
		});

		const result = await db.select().from(accounts);
		expect(result.length).toBe(2);
		expect(result.find((r) => r.id === 1)?.balance).toBe(100);
		expect(result.find((r) => r.id === 2)?.balance).toBe(200);
	});

	test('transactionWithRetry retries on OCC conflict', async ({ db, client, push }) => {
		const accounts = pgTable('tx_retry_accounts_2', {
			id: integer('id').primaryKey(),
			balance: integer('balance').notNull(),
		});

		await push({ accounts });

		// Insert initial data
		await db.insert(accounts).values({ id: 1, balance: 100 });

		let retryCount = 0;

		// This transaction will be retried due to OCC conflict
		await db.transactionWithRetry(
			async (tx) => {
				// Read the current balance (establishes read set)
				const [account] = await tx.select().from(accounts).where(sql`${accounts.id} = 1`);
				const currentBalance = account!.balance;

				// On first attempt, trigger a concurrent update from another connection
				if (retryCount === 0) {
					// Use the raw client to execute a concurrent transaction
					// This simulates another region/connection updating the same row
					await client.query('BEGIN');
					await client.query('UPDATE tx_retry_accounts_2 SET balance = balance + 50 WHERE id = 1');
					await client.query('COMMIT');
				}

				retryCount++;

				// Try to update - this should fail with OCC on first attempt
				await tx.update(accounts).set({ balance: currentBalance - 30 }).where(sql`${accounts.id} = 1`);
			},
			undefined,
			{
				maxRetries: 3,
				onRetry: (error, attempt) => {
					console.log(`[test] OCC retry attempt ${attempt}:`, (error as Error).message);
				},
			},
		);

		// Verify retry happened
		expect(retryCount).toBeGreaterThan(1);

		// Final balance should be: 100 + 50 (concurrent update) - 30 (our update after retry) = 120
		const [finalAccount] = await db.select().from(accounts).where(sql`${accounts.id} = 1`);
		expect(finalAccount!.balance).toBe(120);
	});

	test('transactionWithRetry throws after max retries exhausted', async ({ db, client, push }) => {
		const accounts = pgTable('tx_retry_accounts_3', {
			id: integer('id').primaryKey(),
			balance: integer('balance').notNull(),
		});

		await push({ accounts });

		// Insert initial data
		await db.insert(accounts).values({ id: 1, balance: 100 });

		let attemptCount = 0;

		// This transaction will always conflict because we keep updating concurrently
		await expect(
			db.transactionWithRetry(
				async (tx) => {
					attemptCount++;

					// Read the current balance
					const [account] = await tx.select().from(accounts).where(sql`${accounts.id} = 1`);
					const currentBalance = account!.balance;

					// Always trigger a concurrent update to cause perpetual conflicts
					await client.query('BEGIN');
					await client.query(`UPDATE tx_retry_accounts_3 SET balance = ${currentBalance + attemptCount} WHERE id = 1`);
					await client.query('COMMIT');

					// This update will always conflict
					await tx.update(accounts).set({ balance: currentBalance - 10 }).where(sql`${accounts.id} = 1`);
				},
				undefined,
				{ maxRetries: 2 }, // Only allow 2 retries
			),
		).rejects.toThrow('retry attempts');

		// Should have attempted 3 times (initial + 2 retries)
		expect(attemptCount).toBe(3);
	});

	test('regular transaction does NOT retry on OCC conflict', async ({ db, client, push }) => {
		const accounts = pgTable('tx_no_retry_accounts', {
			id: integer('id').primaryKey(),
			balance: integer('balance').notNull(),
		});

		await push({ accounts });

		// Insert initial data
		await db.insert(accounts).values({ id: 1, balance: 100 });

		let attemptCount = 0;

		// Regular transaction should fail immediately without retry
		await expect(
			db.transaction(async (tx) => {
				attemptCount++;

				// Read the current balance
				const [account] = await tx.select().from(accounts).where(sql`${accounts.id} = 1`);
				const currentBalance = account!.balance;

				// Trigger concurrent update
				await client.query('BEGIN');
				await client.query('UPDATE tx_no_retry_accounts SET balance = balance + 50 WHERE id = 1');
				await client.query('COMMIT');

				// This should fail with OCC error
				await tx.update(accounts).set({ balance: currentBalance - 30 }).where(sql`${accounts.id} = 1`);
			}),
		).rejects.toThrow(); // Will throw an error (OCC conflict wrapped by drizzle)

		// Should have only attempted once (no retries)
		expect(attemptCount).toBe(1);
	});

	test('transaction rollback', async ({ db, push }) => {
		const users = pgTable('tx_users_2', {
			id: uuid('id').primaryKey().defaultRandom(),
			name: text('name').notNull(),
		});

		await push({ users });

		await expect(
			db.transaction(async (tx) => {
				await tx.insert(users).values({ name: 'John' });
				throw new Error('Rollback test');
			}),
		).rejects.toThrow('Rollback test');

		const result = await db.select().from(users);
		expect(result.length).toBe(0);
	});

	test('transaction with read only access mode', async ({ db, push }) => {
		const users = pgTable('tx_users_3', {
			id: uuid('id').primaryKey().defaultRandom(),
			name: text('name').notNull(),
		});

		await push({ users });

		// Insert data before read-only transaction
		await db.insert(users).values({ name: 'John' });

		const result = await db.transaction(
			async (tx) => {
				return tx.select().from(users);
			},
			{ accessMode: 'read only' },
		);

		expect(result.length).toBe(1);
		expect(result[0]!.name).toBe('John');
	});

	// DSQL doesn't support savepoints, so nested transactions throw a clear error
	test('nested transactions throw clear error', async ({ db, push }) => {
		const users = pgTable('tx_users_4', {
			id: uuid('id').primaryKey().defaultRandom(),
			name: text('name').notNull(),
		});

		await push({ users });

		await db.transaction(async (tx) => {
			await tx.insert(users).values({ name: 'John' });

			// Nested transaction should throw a clear error
			await expect(
				tx.transaction(async (_tx2) => {
					// This should never execute
				}),
			).rejects.toThrow('DSQL does not support nested transactions (savepoints)');
		});
	});
});

describe('dsql-specific: raw sql execution', () => {
	test('db.execute with params', async ({ db, push }) => {
		const users = pgTable('raw_users_1', {
			id: uuid('id').primaryKey().defaultRandom(),
			name: text('name').notNull(),
		});

		await push({ users });

		await db.execute(
			sql`INSERT INTO ${users} (${sql.identifier('name')}) VALUES (${'John'})`,
		);

		const result = await db.execute<{ id: string; name: string }>(
			sql`SELECT * FROM ${users}`,
		);

		expect(result.rows.length).toBe(1);
		expect(result.rows[0]!.name).toBe('John');
	});

	test('db.execute with query builder', async ({ db, push }) => {
		const users = pgTable('raw_users_2', {
			id: uuid('id').primaryKey().defaultRandom(),
			name: text('name').notNull(),
		});

		await push({ users });

		const inserted = await db.execute<{ id: string; name: string }>(
			db.insert(users).values({ name: 'John' }).returning({ id: users.id, name: users.name }),
		);

		expect(inserted.rows.length).toBe(1);
		expect(inserted.rows[0]!.name).toBe('John');
	});
});

describe('dsql-specific: migrations', () => {
	const migrationDir = './migrations/dsql-test';

	test.beforeEach(async ({ db }) => {
		// Clean up any existing migration artifacts
		if (existsSync(migrationDir)) {
			rmSync(migrationDir, { recursive: true });
		}
		// Clean up migration table
		await db.execute(sql`DROP TABLE IF EXISTS "drizzle"."__drizzle_migrations" CASCADE`).catch((e) => {
			console.debug('[drizzle:dsql:test] Migration table cleanup:', e.message);
		});
		await db.execute(sql`DROP SCHEMA IF EXISTS "drizzle" CASCADE`).catch((e) => {
			console.debug('[drizzle:dsql:test] Schema cleanup:', e.message);
		});
	});

	test.afterEach(() => {
		if (existsSync(migrationDir)) {
			rmSync(migrationDir, { recursive: true });
		}
	});

	test('migrate creates tracking table', async ({ db }) => {
		mkdirSync(migrationDir, { recursive: true });

		// Create a simple migration - folder name must start with 14-digit timestamp
		mkdirSync(`${migrationDir}/20240101000000_initial`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240101000000_initial/migration.sql`,
			`CREATE TABLE IF NOT EXISTS "test_migrate_1" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" TEXT NOT NULL
			);`,
		);

		const result = await migrate(db as any, { migrationsFolder: migrationDir });

		if (!result.success) {
			console.error('Migration failed:', result.error);
		}

		expect(result.success).toBe(true);
		expect(result.appliedStatements).toBe(1);
		expect(result.completedMigrations).toBe(1);

		// Verify table was created
		const tables = await db.execute(sql`
			SELECT tablename FROM pg_tables
			WHERE schemaname = 'public' AND tablename = 'test_migrate_1'
		`);
		expect(tables.rows.length).toBe(1);

		// Cleanup
		await db.execute(sql`DROP TABLE IF EXISTS "test_migrate_1"`);
	});

	test('migrate is idempotent', async ({ db }) => {
		mkdirSync(migrationDir, { recursive: true });

		mkdirSync(`${migrationDir}/20240101000000_initial`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240101000000_initial/migration.sql`,
			`CREATE TABLE IF NOT EXISTS "test_migrate_2" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" TEXT NOT NULL
			);`,
		);

		// Run migration twice
		const result1 = await migrate(db as any, { migrationsFolder: migrationDir });
		const result2 = await migrate(db as any, { migrationsFolder: migrationDir });

		expect(result1.success).toBe(true);
		expect(result1.appliedStatements).toBe(1);

		expect(result2.success).toBe(true);
		expect(result2.appliedStatements).toBe(0); // No new statements applied

		// Cleanup
		await db.execute(sql`DROP TABLE IF EXISTS "test_migrate_2"`);
	});

	test('migrate transforms CREATE INDEX to CREATE INDEX ASYNC', async ({ db }) => {
		mkdirSync(migrationDir, { recursive: true });

		mkdirSync(`${migrationDir}/20240101000000_initial`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240101000000_initial/migration.sql`,
			`CREATE TABLE IF NOT EXISTS "test_migrate_3" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" TEXT NOT NULL
			);
--> statement-breakpoint
CREATE INDEX "test_idx" ON "test_migrate_3" ("name");`,
		);

		const result = await migrate(db as any, { migrationsFolder: migrationDir });

		if (!result.success) {
			console.error('Migration failed:', result.error);
		}

		expect(result.success).toBe(true);
		expect(result.appliedStatements).toBe(2);

		// Verify index exists (DSQL creates indexes asynchronously, so we wait a bit)
		await new Promise((resolve) => setTimeout(resolve, 2000));
		const indexes = await db.execute(sql`
			SELECT indexname FROM pg_indexes
			WHERE tablename = 'test_migrate_3' AND indexname = 'test_idx'
		`);
		expect(indexes.rows.length).toBe(1);

		// Cleanup
		await db.execute(sql`DROP TABLE IF EXISTS "test_migrate_3"`);
	});

	test('multiple migrations with multiple statements each', async ({ db }) => {
		mkdirSync(migrationDir, { recursive: true });

		// First migration: 2 statements
		mkdirSync(`${migrationDir}/20240101000000_first`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240101000000_first/migration.sql`,
			`CREATE TABLE IF NOT EXISTS "multi_test_users" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" TEXT NOT NULL
			);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "multi_test_posts" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"title" TEXT NOT NULL,
				"user_id" UUID NOT NULL
			);`,
		);

		// Second migration: 3 statements
		mkdirSync(`${migrationDir}/20240102000000_second`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240102000000_second/migration.sql`,
			`ALTER TABLE "multi_test_users" ADD COLUMN "email" TEXT;
--> statement-breakpoint
ALTER TABLE "multi_test_posts" ADD COLUMN "content" TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "multi_test_comments" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"post_id" UUID NOT NULL,
				"body" TEXT NOT NULL
			);`,
		);

		const result = await migrate(db as any, { migrationsFolder: migrationDir });

		if (!result.success) {
			console.error('Migration failed:', result.error);
		}

		expect(result.success).toBe(true);
		expect(result.appliedStatements).toBe(5); // 2 + 3 statements
		expect(result.completedMigrations).toBe(2);

		// Verify all tables exist with correct columns
		const users = await db.execute(sql`
			SELECT column_name FROM information_schema.columns
			WHERE table_name = 'multi_test_users' ORDER BY column_name
		`);
		expect(users.rows.map((r: any) => r.column_name)).toContain('email');

		const posts = await db.execute(sql`
			SELECT column_name FROM information_schema.columns
			WHERE table_name = 'multi_test_posts' ORDER BY column_name
		`);
		expect(posts.rows.map((r: any) => r.column_name)).toContain('content');

		const comments = await db.execute(sql`
			SELECT tablename FROM pg_tables WHERE tablename = 'multi_test_comments'
		`);
		expect(comments.rows.length).toBe(1);

		// Cleanup
		await db.execute(sql`DROP TABLE IF EXISTS "multi_test_comments"`);
		await db.execute(sql`DROP TABLE IF EXISTS "multi_test_posts"`);
		await db.execute(sql`DROP TABLE IF EXISTS "multi_test_users"`);
	});

	test('migration resumes after partial failure', async ({ db }) => {
		mkdirSync(migrationDir, { recursive: true });

		// Migration with 3 statements - second one will fail initially
		mkdirSync(`${migrationDir}/20240101000000_partial`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240101000000_partial/migration.sql`,
			`CREATE TABLE IF NOT EXISTS "partial_test_1" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" TEXT NOT NULL
			);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partial_test_2" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"bad_column" BADTYPE
			);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partial_test_3" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"value" TEXT
			);`,
		);

		// First run should fail on statement 2
		const result1 = await migrate(db as any, { migrationsFolder: migrationDir });
		expect(result1.success).toBe(false);
		expect(result1.appliedStatements).toBe(1); // Only first statement succeeded
		if (!result1.success) {
			expect(result1.error.statementIndex).toBe(1); // Failed on index 1 (second statement)
		}

		// Verify first table was created
		const table1 = await db.execute(sql`
			SELECT tablename FROM pg_tables WHERE tablename = 'partial_test_1'
		`);
		expect(table1.rows.length).toBe(1);

		// Fix the migration file
		writeFileSync(
			`${migrationDir}/20240101000000_partial/migration.sql`,
			`CREATE TABLE IF NOT EXISTS "partial_test_1" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" TEXT NOT NULL
			);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partial_test_2" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"fixed_column" TEXT
			);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partial_test_3" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"value" TEXT
			);`,
		);

		// Second run should resume from statement 2 (but will fail because hash changed)
		// The migrator should warn about hash mismatch but skip applied statements
		const result2 = await migrate(db as any, { migrationsFolder: migrationDir });

		// Note: Since statement hashes changed, the migrator will see them as new statements
		// This tests the real-world scenario where you fix a broken migration
		if (!result2.success) {
			console.error('Second migration run failed:', result2.error);
		}

		expect(result2.success).toBe(true);

		// Verify all tables exist now
		const tables = await db.execute(sql`
			SELECT tablename FROM pg_tables
			WHERE tablename IN ('partial_test_1', 'partial_test_2', 'partial_test_3')
			ORDER BY tablename
		`);
		expect(tables.rows.length).toBe(3);

		// Cleanup
		await db.execute(sql`DROP TABLE IF EXISTS "partial_test_3"`);
		await db.execute(sql`DROP TABLE IF EXISTS "partial_test_2"`);
		await db.execute(sql`DROP TABLE IF EXISTS "partial_test_1"`);
	});

	test('getMigrationStatus reports pending/applied counts', async ({ db }) => {
		mkdirSync(migrationDir, { recursive: true });

		mkdirSync(`${migrationDir}/20240101000000_initial`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240101000000_initial/migration.sql`,
			`CREATE TABLE IF NOT EXISTS "test_migrate_4" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" TEXT NOT NULL
			);`,
		);

		// Check status before migration
		const statusBefore = await getMigrationStatus(db as any, { migrationsFolder: migrationDir });
		expect(statusBefore.pendingMigrations).toBe(1);
		expect(statusBefore.pendingStatements).toBe(1);
		expect(statusBefore.appliedMigrations).toBe(0);
		expect(statusBefore.appliedStatements).toBe(0);

		// Run migration
		const result = await migrate(db as any, { migrationsFolder: migrationDir });
		if (!result.success) {
			console.error('Migration failed:', result.error);
		}

		// Check status after migration
		const statusAfter = await getMigrationStatus(db as any, { migrationsFolder: migrationDir });
		expect(statusAfter.pendingMigrations).toBe(0);
		expect(statusAfter.pendingStatements).toBe(0);
		expect(statusAfter.appliedMigrations).toBe(1);
		expect(statusAfter.appliedStatements).toBe(1);

		// Cleanup
		await db.execute(sql`DROP TABLE IF EXISTS "test_migrate_4"`);
	});
});

describe('dsql-specific: timestamp handling', () => {
	test('timestamp with timezone mode string', async ({ db, push }) => {
		const table = pgTable('ts_test_1', {
			id: uuid('id').primaryKey().defaultRandom(),
			timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
		});

		await push({ table });

		const timestampString = '2022-01-01 00:00:00.123456-0200';

		await db.insert(table).values([{ timestamp: timestampString }]);

		const result = await db.select().from(table);

		// DSQL returns timestamps in UTC
		expect(result[0]!.timestamp).toContain('2022-01-01');
		expect(result[0]!.timestamp).toContain('+00');
	});

	test('timestamp with timezone mode date', async ({ db, push }) => {
		const table = pgTable('ts_test_2', {
			id: uuid('id').primaryKey().defaultRandom(),
			timestamp: timestamp('timestamp_date', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
		});

		await push({ table });

		const insertedDate = new Date('2022-01-01 20:00:00.123+04');

		await db.insert(table).values([{ timestamp: insertedDate }]);

		const result = await db.select().from(table);

		expect(result[0]!.timestamp).toBeInstanceOf(Date);
		expect(result[0]!.timestamp.getTime()).toBe(insertedDate.getTime());
	});

	test('timestamp without timezone mode string', async ({ db, push }) => {
		const table = pgTable('ts_test_3', {
			id: uuid('id').primaryKey().defaultRandom(),
			timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
		});

		await push({ table });

		await db.insert(table).values([{ timestamp: '2022-01-01 02:00:00.123456' }]);

		const result = await db.select().from(table);

		expect(result[0]!.timestamp).toBe('2022-01-01 02:00:00.123456');
	});
});

describe('dsql-specific: UUID handling', () => {
	test('UUID generation with defaultRandom', async ({ db, push }) => {
		const table = pgTable('uuid_test_1', {
			id: uuid('id').primaryKey().defaultRandom(),
			name: text('name').notNull(),
		});

		await push({ table });

		const [result] = await db.insert(table).values({ name: 'test' }).returning();

		expect(result!.id).toBeDefined();
		// UUID format validation
		expect(result!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
	});

	test('explicit UUID insertion', async ({ db, push }) => {
		const table = pgTable('uuid_test_2', {
			id: uuid('id').primaryKey(),
			name: text('name').notNull(),
		});

		await push({ table });

		const explicitId = '123e4567-e89b-12d3-a456-426614174000';
		const [result] = await db.insert(table).values({ id: explicitId, name: 'test' }).returning();

		expect(result!.id).toBe(explicitId);
	});
});

describe('dsql-specific: relational queries (RQB)', () => {
	test('findMany with relations', async ({ db, push }) => {
		const users = pgTable('rqb_users_1', {
			id: uuid('id').primaryKey().defaultRandom(),
			name: text('name').notNull(),
		});

		const posts = pgTable('rqb_posts_1', {
			id: uuid('id').primaryKey().defaultRandom(),
			title: text('title').notNull(),
			authorId: uuid('author_id').notNull(),
		});

		await push({ users, posts });

		// Insert test data
		const [user] = await db.insert(users).values({ name: 'John' }).returning();
		await db.insert(posts).values([
			{ title: 'Post 1', authorId: user!.id },
			{ title: 'Post 2', authorId: user!.id },
		]);

		// Query with join (RQB-style using query builder)
		const result = await db
			.select({
				userName: users.name,
				postTitle: posts.title,
			})
			.from(users)
			.innerJoin(posts, sql`${users.id} = ${posts.authorId}`)
			.where(sql`${users.id} = ${user!.id}`);

		expect(result.length).toBe(2);
		expect(result[0]!.userName).toBe('John');
	});

	test('subquery in select', async ({ db, push }) => {
		const users = pgTable('rqb_users_2', {
			id: uuid('id').primaryKey().defaultRandom(),
			name: text('name').notNull(),
		});

		const posts = pgTable('rqb_posts_2', {
			id: uuid('id').primaryKey().defaultRandom(),
			authorId: uuid('author_id').notNull(),
		});

		await push({ users, posts });

		const [user] = await db.insert(users).values({ name: 'Jane' }).returning();
		await db.insert(posts).values([
			{ authorId: user!.id },
			{ authorId: user!.id },
			{ authorId: user!.id },
		]);

		// Count posts per user using subquery
		const sq = db
			.select({ count: sql<number>`count(*)::int`.as('count'), authorId: posts.authorId })
			.from(posts)
			.groupBy(posts.authorId)
			.as('post_counts');

		const result = await db
			.select({
				name: users.name,
				postCount: sq.count,
			})
			.from(users)
			.leftJoin(sq, sql`${users.id} = ${sq.authorId}`);

		expect(result.length).toBe(1);
		expect(result[0]!.postCount).toBe(3);
	});
});

describe('dsql-specific: edge cases', () => {
	test('empty result set', async ({ db, push }) => {
		const table = pgTable('edge_empty', {
			id: uuid('id').primaryKey().defaultRandom(),
			name: text('name').notNull(),
		});

		await push({ table });

		const result = await db.select().from(table);
		expect(result).toEqual([]);
	});

	test('large batch insert', async ({ db, push }) => {
		const table = pgTable('edge_batch', {
			id: uuid('id').primaryKey().defaultRandom(),
			value: integer('value').notNull(),
		});

		await push({ table });

		// Insert 100 rows
		const values = Array.from({ length: 100 }, (_, i) => ({ value: i }));
		await db.insert(table).values(values);

		const count = await db.select({ count: sql<number>`count(*)::int` }).from(table);
		expect(count[0]!.count).toBe(100);
	});

	test('special characters in text', async ({ db, push }) => {
		const table = pgTable('edge_special_chars', {
			id: uuid('id').primaryKey().defaultRandom(),
			content: text('content').notNull(),
		});

		await push({ table });

		const specialContent = `Hello "World"! It's a test with 'quotes', \\ backslash, and unicode: 你好 🎉`;

		const [inserted] = await db.insert(table).values({ content: specialContent }).returning();
		expect(inserted!.content).toBe(specialContent);

		const selected = await db.select().from(table).where(sql`${table.id} = ${inserted!.id}`);
		expect(selected[0]!.content).toBe(specialContent);
	});

	test('null values', async ({ db, push }) => {
		const table = pgTable('edge_nulls', {
			id: uuid('id').primaryKey().defaultRandom(),
			required: text('required').notNull(),
			optional: text('optional'),
		});

		await push({ table });

		const [inserted] = await db.insert(table).values({ required: 'test', optional: null }).returning();

		expect(inserted!.optional).toBeNull();
	});

	test('prepared statement reuse', async ({ db, push }) => {
		const table = pgTable('edge_prepared', {
			id: uuid('id').primaryKey().defaultRandom(),
			name: text('name').notNull(),
		});

		await push({ table });

		// Create prepared statement
		const prepared = db
			.select()
			.from(table)
			.where(sql`${table.name} = ${sql.placeholder('name')}`)
			.prepare('find_by_name');

		await db.insert(table).values([{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }]);

		// Execute multiple times with different params
		const alice = await prepared.execute({ name: 'Alice' });
		const bob = await prepared.execute({ name: 'Bob' });
		const charlie = await prepared.execute({ name: 'Charlie' });
		const notFound = await prepared.execute({ name: 'Nobody' });

		expect(alice.length).toBe(1);
		expect(alice[0]!.name).toBe('Alice');
		expect(bob.length).toBe(1);
		expect(bob[0]!.name).toBe('Bob');
		expect(charlie.length).toBe(1);
		expect(charlie[0]!.name).toBe('Charlie');
		expect(notFound.length).toBe(0);
	});
});
