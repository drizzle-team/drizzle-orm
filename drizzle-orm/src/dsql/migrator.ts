import crypto from 'node:crypto';
import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { sql } from '~/sql/sql.ts';
import type { DSQLDatabase } from './driver.ts';

/**
 * Result shape for queries (pg-compatible).
 */
interface QueryResult<T> {
	rows: T[];
	rowCount?: number;
}

/**
 * Result of a DSQL migration run with statement-level tracking.
 */
export interface DSQLMigrationResult {
	/** Whether all migrations completed successfully */
	success: boolean;
	/** Number of statements successfully applied */
	appliedStatements: number;
	/** Total number of statements across all pending migrations */
	totalStatements: number;
	/** Number of migrations fully completed */
	completedMigrations: number;
	/** Total number of pending migrations */
	totalMigrations: number;
	/** Error details if migration failed */
	error?: {
		message: string;
		migrationName: string;
		statementIndex: number;
		sql?: string;
	};
}

/**
 * Hash a single SQL statement for tracking purposes.
 */
function hashStatement(stmt: string): string {
	return crypto.createHash('sha256').update(stmt.trim()).digest('hex');
}

/**
 * Generate a timestamp-based ID for the migrations table (DSQL has no sequences).
 */
function generateId(): bigint {
	// Use current timestamp in microseconds + random component for uniqueness
	return BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
}

/**
 * Migrate the database using DSQL-specific statement-level tracking.
 *
 * DSQL constraints handled:
 * - One DDL statement per transaction (auto-commits)
 * - Cannot mix DDL and DML in same transaction
 * - No sequences (uses timestamp-based IDs)
 *
 * Each statement is executed and tracked individually, allowing recovery
 * from partial failures by re-running the migration command.
 *
 * @param db - DSQL database instance
 * @param config - Migration configuration
 * @returns Migration result with details on applied statements
 */
export async function migrate(
	db: DSQLDatabase<Record<string, unknown>>,
	config: string | MigrationConfig,
): Promise<DSQLMigrationResult> {
	const migrations = readMigrationFiles(typeof config === 'string' ? { migrationsFolder: config } : config);
	return migrateInternal(db, migrations, config);
}

/**
 * Internal migration function for testing with custom migrations.
 * @internal
 */
export async function migrateInternal(
	db: DSQLDatabase<Record<string, unknown>>,
	migrations: MigrationMeta[],
	config: string | MigrationConfig,
): Promise<DSQLMigrationResult> {
	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';

	// Step 1: Create schema if not exists (DDL - auto-commits)
	await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);

	// Step 2: Create migrations table with statement-level tracking (DDL - auto-commits)
	const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
			id BIGINT PRIMARY KEY,
			migration_hash TEXT NOT NULL,
			migration_folder_millis BIGINT NOT NULL,
			statement_index INTEGER NOT NULL,
			statement_hash TEXT NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			UNIQUE (migration_hash, statement_index)
		)
	`;
	await db.execute(migrationTableCreate);

	// Step 3: Query applied statements from tracking table
	const appliedStatements = await db.execute(
		sql`SELECT migration_hash, statement_index, statement_hash
			FROM ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}
			ORDER BY migration_folder_millis, statement_index`,
	) as QueryResult<{ migration_hash: string; statement_index: number; statement_hash: string }>;

	// Build maps for quick lookup of applied statements
	const appliedSet = new Set(
		appliedStatements.rows.map((row) => `${row.migration_hash}:${row.statement_index}`),
	);
	// Map of statement key to stored statement hash for mismatch detection
	const appliedHashMap = new Map(
		appliedStatements.rows.map((row) => [`${row.migration_hash}:${row.statement_index}`, row.statement_hash]),
	);

	// Calculate totals for pending work
	let totalStatements = 0;
	let totalMigrations = 0;
	for (const migration of migrations) {
		const hasUnappliedStatements = migration.sql.some(
			(_, idx) => !appliedSet.has(`${migration.hash}:${idx}`),
		);
		if (hasUnappliedStatements) {
			totalMigrations++;
			totalStatements += migration.sql.filter(
				(_, idx) => !appliedSet.has(`${migration.hash}:${idx}`),
			).length;
		}
	}

	let appliedStatementsCount = 0;
	let completedMigrations = 0;

	// Step 4: For each pending statement, execute and track
	for (const migration of migrations) {
		let migrationComplete = true;
		let migrationHadPendingStatements = false;

		for (let stmtIdx = 0; stmtIdx < migration.sql.length; stmtIdx++) {
			const stmt = migration.sql[stmtIdx]!;
			const stmtKey = `${migration.hash}:${stmtIdx}`;
			const currentStmtHash = hashStatement(stmt);

			// Check for modified statements
			if (appliedSet.has(stmtKey)) {
				const storedHash = appliedHashMap.get(stmtKey);
				if (storedHash && storedHash !== currentStmtHash) {
					console.warn(
						`Warning: Migration statement ${stmtIdx} in migration ${getMigrationName(migration.folderMillis)} `
							+ `has been modified since it was applied. The stored hash (${storedHash.slice(0, 8)}...) `
							+ `differs from the current hash (${currentStmtHash.slice(0, 8)}...). `
							+ `This statement will be skipped, but the change may indicate a problem.`,
					);
				}
				continue;
			}

			migrationHadPendingStatements = true;
			const trimmedStmt = stmt.trim();

			// Skip empty statements
			if (!trimmedStmt) {
				// Still track it to maintain statement indices
				const id = generateId();
				await db.execute(
					sql`INSERT INTO ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}
						(id, migration_hash, migration_folder_millis, statement_index, statement_hash)
						VALUES (${id}, ${migration.hash}, ${migration.folderMillis}, ${stmtIdx}, ${currentStmtHash})`,
				);
				appliedStatementsCount++;
				continue;
			}

			try {
				// Execute DDL statement (auto-commits in DSQL)
				await db.execute(sql.raw(trimmedStmt));

				// Insert tracking record (separate DML - also auto-commits)
				const id = generateId();
				await db.execute(
					sql`INSERT INTO ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}
						(id, migration_hash, migration_folder_millis, statement_index, statement_hash)
						VALUES (${id}, ${migration.hash}, ${migration.folderMillis}, ${stmtIdx}, ${currentStmtHash})`,
				);

				appliedStatementsCount++;
			} catch (e) {
				// On error: capture details, stop, report what succeeded
				const error = e as Error;
				return {
					success: false,
					appliedStatements: appliedStatementsCount,
					totalStatements,
					completedMigrations,
					totalMigrations,
					error: {
						message: error.message,
						migrationName: getMigrationName(migration.folderMillis),
						statementIndex: stmtIdx,
						sql: trimmedStmt.length > 200 ? trimmedStmt.slice(0, 200) + '...' : trimmedStmt,
					},
				};
			}
		}

		if (migrationHadPendingStatements && migrationComplete) {
			completedMigrations++;
		}
	}

	return {
		success: true,
		appliedStatements: appliedStatementsCount,
		totalStatements,
		completedMigrations,
		totalMigrations,
	};
}

/**
 * Get migration status without applying changes.
 *
 * @param db - DSQL database instance
 * @param config - Migration configuration
 * @returns Status information about applied and pending migrations
 */
export async function getMigrationStatus(
	db: DSQLDatabase<Record<string, unknown>>,
	config: string | MigrationConfig,
): Promise<{
	appliedMigrations: number;
	pendingMigrations: number;
	appliedStatements: number;
	pendingStatements: number;
}> {
	const migrations = readMigrationFiles(typeof config === 'string' ? { migrationsFolder: config } : config);
	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';

	// Check if table exists
	const tableExists = await db.execute(sql`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = ${migrationsSchema}
			AND table_name = ${migrationsTable}
		) as exists
	`) as QueryResult<{ exists: boolean }>;

	if (!tableExists.rows[0]?.exists) {
		// No migrations table - all migrations are pending
		const totalStatements = migrations.reduce((sum, m) => sum + m.sql.length, 0);
		return {
			appliedMigrations: 0,
			pendingMigrations: migrations.length,
			appliedStatements: 0,
			pendingStatements: totalStatements,
		};
	}

	const appliedStatements = await db.execute(
		sql`SELECT migration_hash, statement_index, statement_hash
			FROM ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`,
	) as QueryResult<{ migration_hash: string; statement_index: number; statement_hash: string }>;

	const appliedSet = new Set(
		appliedStatements.rows.map((row) => `${row.migration_hash}:${row.statement_index}`),
	);

	let appliedMigrationsCount = 0;
	let pendingMigrationsCount = 0;
	let appliedStatementsCount = 0;
	let pendingStatementsCount = 0;

	for (const migration of migrations) {
		let migrationFullyApplied = true;
		for (let stmtIdx = 0; stmtIdx < migration.sql.length; stmtIdx++) {
			const stmtKey = `${migration.hash}:${stmtIdx}`;
			if (appliedSet.has(stmtKey)) {
				appliedStatementsCount++;
			} else {
				pendingStatementsCount++;
				migrationFullyApplied = false;
			}
		}
		if (migrationFullyApplied) {
			appliedMigrationsCount++;
		} else {
			pendingMigrationsCount++;
		}
	}

	return {
		appliedMigrations: appliedMigrationsCount,
		pendingMigrations: pendingMigrationsCount,
		appliedStatements: appliedStatementsCount,
		pendingStatements: pendingStatementsCount,
	};
}

/**
 * Convert folder millis to a human-readable migration name.
 */
function getMigrationName(folderMillis: number): string {
	const date = new Date(folderMillis);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');
	return `${year}${month}${day}${hours}${minutes}${seconds}`;
}
