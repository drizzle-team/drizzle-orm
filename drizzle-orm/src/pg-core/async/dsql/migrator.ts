import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { PgQueryResultHKT } from '~/pg-core/session.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import { upgradeIfNeeded } from '~/up-migrations/dsql.ts';
import type { DsqlAsyncDatabase } from './db.ts';
import { isDsqlOccError } from './session.ts';

/** DSQL transactions allow only one DDL statement per transaction - rollbacks on failure must be done manually */
export async function migrate(
	migrations: MigrationMeta[],
	db: DsqlAsyncDatabase<PgQueryResultHKT, any>,
	config: string | MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';
	const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`;

	await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);

	const { newDb } = await upgradeIfNeeded(migrationsSchema, migrationsTable, db, migrations);

	if (newDb) {
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${table} (
				id integer PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint,
				name text,
				applied_at timestamp with time zone DEFAULT now()
			)
		`;
		await db.execute(migrationTableCreate);
	}

	const dbMigrations = await db.session.objects<{ id: number; hash: string; created_at: string; name: string }>(
		sql`select id, hash, created_at, name from ${table}`,
	);

	// DSQL has no `SERIAL` type, mimic sequence
	let nextId = dbMigrations.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1;

	if (typeof config === 'object' && config.init) {
		if (dbMigrations.length) {
			return { exitCode: 'databaseMigrations' as const };
		}

		if (migrations.length > 1) {
			return { exitCode: 'localMigrations' as const };
		}

		const [migration] = migrations;

		if (!migration) return;

		await db.execute(
			sql`insert into ${table} ("id", "hash", "created_at", "name") values(${nextId}, ${migration.hash}, ${migration.folderMillis}, ${
				migration.name ?? null
			})`,
		);

		return;
	}

	const migrationsToRun = getMigrationsToRun({ localMigrations: migrations, dbMigrations });
	for (const migration of migrationsToRun) {
		for (const stmt of migration.sql) {
			await runStatement(db, stmt, migration.name);
		}
		await db.execute(
			sql`insert into ${table} ("id", "hash", "created_at", "name") values(${nextId++}, ${migration.hash}, ${migration.folderMillis}, ${
				migration.name ?? null
			})`,
		);
	}
}

type Db = DsqlAsyncDatabase<PgQueryResultHKT, any>;

const ATTEMPTS = 5;
// A wait or a read of a job only reads, and the job runs on, so it outlasts more conflicts than a statement.
const WAIT_ATTEMPTS = 20;

// A dropped connection while waiting on a job, for example after a server restart, leaves the job running.
// postgres.js reports a closed connection with codes of its own, and node-postgres without a code.
function isConnectionError(error: unknown): boolean {
	for (let e: any = error, depth = 0; e && typeof e === 'object' && depth < 8; e = e.cause, ++depth) {
		const code = typeof e.code === 'string' ? e.code : '';
		if (
			code.startsWith('08') || code === '57P01' || code === 'XX000' || code === 'ECONNRESET' || code === 'EPIPE'
			|| code === 'ETIMEDOUT' || code === 'CONNECTION_CLOSED' || code === 'CONNECT_TIMEOUT'
		) return true;
		if (typeof e.message === 'string' && e.message.startsWith('Connection terminated')) return true;
	}
	return false;
}

const isTransient = (error: unknown) => isDsqlOccError(error) || isConnectionError(error);

async function withRetry<T>(
	fn: () => Promise<T>,
	retryable: (error: unknown) => boolean,
	attempts = ATTEMPTS,
): Promise<T> {
	for (let attempt = 1;; attempt++) {
		try {
			return await fn();
		} catch (error) {
			if (attempt >= attempts || !retryable(error)) throw error;
			await new Promise((resolve) => setTimeout(resolve, Math.min(1000, 25 * 2 ** attempt) * (0.5 + Math.random())));
		}
	}
}

function errorMessage(error: unknown): string {
	for (let e: any = error, depth = 0; e && depth < 8; e = e.cause, ++depth) {
		if (e.cause === undefined && typeof e.message === 'string') return e.message;
	}
	return error instanceof Error ? error.message : String(error);
}

// Finds the object of a failed job from its catalog class and object id, and the statement that drops it.
async function dropStatementFor(
	db: Db,
	classId: number,
	objectId: string,
): Promise<{ drop: SQL; name: string } | undefined> {
	if (classId === 1259) {
		const [index] = await withRetry(
			() =>
				db.session.objects<{ schema: string; name: string }>(
					sql`SELECT n.nspname AS "schema", c.relname AS "name" FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.oid = ${objectId}::oid`,
				),
			isTransient,
			WAIT_ATTEMPTS,
		);
		if (!index) return;
		return {
			drop: sql`DROP INDEX IF EXISTS ${sql.identifier(index.schema)}.${sql.identifier(index.name)}`,
			name: `"${index.schema}"."${index.name}"`,
		};
	}
	if (classId === 2606) {
		const [constraint] = await withRetry(
			() =>
				db.session.objects<{ schema: string; table: string; name: string }>(
					sql`SELECT n.nspname AS "schema", t.relname AS "table", con.conname AS "name" FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class t ON t.oid = con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace WHERE con.oid = ${objectId}::oid`,
				),
			isTransient,
			WAIT_ATTEMPTS,
		);
		if (!constraint) return;
		return {
			drop: sql`ALTER TABLE ${sql.identifier(constraint.schema)}.${
				sql.identifier(constraint.table)
			} DROP CONSTRAINT IF EXISTS ${sql.identifier(constraint.name)}`,
			name: `"${constraint.name}" on "${constraint.schema}"."${constraint.table}"`,
		};
	}
	return;
}

type Job = {
	status: string;
	job_type: string;
	object_name: string;
	details: string | null;
	class_id: string;
	object_id: string;
};

type JobResult = { succeeded: true } | { succeeded: false; job?: Job; readError?: unknown };

// `sys.wait_for_job` returns false when the job fails, but also when the wait ends before the job does, and a
// wait can fail while the job runs on. Only `sys.jobs` tells them apart, and a job that still runs must not be
// treated as failed, because dropping its index cancels the build.
async function waitForJob(db: Db, jobId: string): Promise<JobResult> {
	for (;;) {
		let waitError: unknown;
		try {
			const [result] = await withRetry(
				() => db.session.objects<{ succeeded: boolean }>(sql`CALL sys.wait_for_job(${jobId})`),
				isTransient,
				WAIT_ATTEMPTS,
			);
			if (result?.succeeded === true) return { succeeded: true };
		} catch (error) {
			waitError = error;
		}

		let job: Job | undefined;
		try {
			[job] = await withRetry(
				() =>
					db.session.objects<Job>(
						sql`SELECT status, job_type, object_name, details, class_id, object_id FROM sys.jobs WHERE job_id = ${jobId}`,
					),
				isTransient,
				WAIT_ATTEMPTS,
			);
		} catch (readError) {
			if (waitError) throw waitError;
			return { succeeded: false, readError };
		}

		if (!job) {
			if (waitError) throw waitError;
			return { succeeded: false };
		}
		if (job.status === 'completed') return { succeeded: true };
		if (job.status === 'failed') return { succeeded: false, job };
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}

async function failJob(
	db: Db,
	jobId: string,
	stmt: string,
	migrationName: string,
	result: { job?: Job; readError?: unknown },
): Promise<never> {
	const { job } = result;
	let cleanup =
		'The failed object was dropped. If the migration replaced an index or constraint, it dropped the old one first, so the table now has neither.';
	let leftBehind = job?.object_name ?? 'the object of the job';
	if (result.readError !== undefined) {
		cleanup = `Dropping it failed, so ${leftBehind} is left behind: ${errorMessage(result.readError)}`;
	} else if (job) {
		try {
			const target = await dropStatementFor(db, Number(job.class_id), String(job.object_id));
			if (target) {
				leftBehind = target.name;
				await withRetry(() => db.session.objects(target.drop), isDsqlOccError);
			}
		} catch (error) {
			cleanup = `Dropping it failed, so ${leftBehind} is left behind: ${errorMessage(error)}`;
		}
	}

	throw new DrizzleError({
		message: [
			`Migration "${migrationName}" failed: Aurora DSQL job ${jobId} (${job?.job_type ?? 'unknown'} of ${
				job?.object_name ?? 'unknown'
			}) failed: ${job?.details ?? 'no details'}`,
			`Statement: ${stmt}`,
			cleanup,
			"The earlier statements of this migration stay applied and the migration isn't recorded, so fix the data and the database before you run it again.",
		].join('\n'),
	});
}

// CREATE INDEX ASYNC and ALTER TABLE ASYNC return the id of the job they start. Other statements, for example
// an insert that returns a `job_id` column, start no job.
const startsJob = (stmt: string) => /\b(INDEX|TABLE)\s+ASYNC\b/i.test(stmt);

// A statement that fails with an OCC conflict didn't commit, so it runs again. A statement that starts an async
// job (CREATE INDEX ASYNC, ALTER TABLE ASYNC) returns before the job ends, and a failed job raises no error, so
// the migration waits for it and is recorded only after it succeeds. The wait never resubmits the statement.
async function runStatement(db: Db, stmt: string, migrationName: string): Promise<void> {
	const rows = await withRetry(() => db.session.objects<{ job_id?: string }>(sql.raw(stmt)), isDsqlOccError);
	// node-postgres returns no rows for a chunk with several statements, which can't start a job.
	const jobId = startsJob(stmt) ? rows?.[0]?.job_id : undefined;
	if (!jobId) return;

	const result = await waitForJob(db, jobId);
	if (!result.succeeded) await failJob(db, jobId, stmt, migrationName, result);
}
