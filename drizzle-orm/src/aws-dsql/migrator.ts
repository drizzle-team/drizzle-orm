import crypto from 'node:crypto';
import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { sql } from '~/sql/sql.ts';
import type { AwsDsqlDatabase } from './driver.ts';

/**
 * Result shape for queries (pg-compatible).
 */
interface QueryResult<T> {
	rows: T[];
	rowCount?: number;
}

/**
 * Base fields for migration result.
 */
interface AwsDsqlMigrationResultBase {
	/** Number of statements successfully applied */
	appliedStatements: number;
	/** Total number of statements across all pending migrations */
	totalStatements: number;
	/** Number of migrations fully completed */
	completedMigrations: number;
	/** Total number of pending migrations */
	totalMigrations: number;
}

/**
 * Error details when migration fails.
 */
export interface AwsDsqlMigrationError {
	message: string;
	migrationName: string;
	statementIndex: number;
	sql?: string;
}

/**
 * Result of a DSQL migration run with statement-level tracking.
 * Uses discriminated union to enforce error presence on failure.
 */
export type AwsDsqlMigrationResult =
	| (AwsDsqlMigrationResultBase & { success: true })
	| (AwsDsqlMigrationResultBase & { success: false; error: AwsDsqlMigrationError });

/**
 * Hash a single SQL statement for tracking purposes.
 */
function hashStatement(stmt: string): string {
	return crypto.createHash('sha256').update(stmt.trim()).digest('hex');
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

/**
 * Transform SQL statements to use DSQL-specific syntax.
 * - Converts CREATE INDEX to CREATE INDEX ASYNC (required by DSQL)
 */
function transformStatement(stmt: string): string {
	const trimmed = stmt.trim();
	// Match CREATE INDEX (case insensitive) but not CREATE INDEX ASYNC
	const createIndexRegex = /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?!ASYNC\s+)/i;
	if (createIndexRegex.test(trimmed)) {
		// Insert ASYNC after CREATE [UNIQUE] INDEX
		return trimmed.replace(createIndexRegex, (match, unique) => {
			return unique ? `CREATE UNIQUE INDEX ASYNC ` : `CREATE INDEX ASYNC `;
		});
	}
	return trimmed;
}

/**
 * Migrate the database using DSQL-specific statement-level tracking.
 *
 * Each statement is executed and tracked individually, allowing recovery
 * from partial failures by re-running the migration command.
 *
 * @param db - DSQL database instance
 * @param config - Migration configuration
 * @returns Migration result with details on applied statements
 */
export async function migrate(
	db: AwsDsqlDatabase<Record<string, unknown>>,
	config: string | MigrationConfig,
): Promise<AwsDsqlMigrationResult> {
	const migrations = readMigrationFiles(typeof config === 'string' ? { migrationsFolder: config } : config);
	return migrateInternal(db, migrations, config);
}

/**
 * Internal migration function for testing with custom migrations.
 * @internal
 */
export async function migrateInternal(
	db: AwsDsqlDatabase<Record<string, unknown>>,
	migrations: MigrationMeta[],
	config: string | MigrationConfig,
): Promise<AwsDsqlMigrationResult> {
	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';

	// Step 1: Create schema if not exists
	try {
		await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);
	} catch (error) {
		throw new DrizzleError({
			message: `Failed to create migrations schema "${migrationsSchema}". Ensure you have CREATE SCHEMA permission.`,
			cause: error,
		});
	}

	// Step 2: Create migrations table with statement-level tracking
	const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
			id BIGINT GENERATED ALWAYS AS IDENTITY (CACHE 1) PRIMARY KEY,
			migration_hash TEXT NOT NULL,
			migration_folder_millis BIGINT NOT NULL,
			statement_index INTEGER NOT NULL,
			statement_hash TEXT NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			UNIQUE (migration_hash, statement_index)
		)
	`;
	try {
		await db.execute(migrationTableCreate);
	} catch (error) {
		throw new DrizzleError({
			message:
				`Failed to create migrations table "${migrationsSchema}.${migrationsTable}". Ensure you have CREATE TABLE permission.`,
			cause: error,
		});
	}

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
			const originalStmt = migration.sql[stmtIdx]!;
			const stmtKey = `${migration.hash}:${stmtIdx}`;
			const currentStmtHash = hashStatement(originalStmt);

			// Check for modified statements
			if (appliedSet.has(stmtKey)) {
				const storedHash = appliedHashMap.get(stmtKey);
				if (storedHash && storedHash !== currentStmtHash) {
					console.warn(
						`Warning: Migration statement ${stmtIdx} in migration ${getMigrationName(migration.folderMillis)} `
							+ `has been modified since it was applied. The stored hash (${storedHash.slice(0, 8)}...) `
							+ `differs from the current hash (${currentStmtHash.slice(0, 8)}...). `
							+ `This statement will be skipped, but the change may indicate a problem.\n`
							+ `Action: If this change is intentional, create a new migration. If not, investigate why the migration file changed.`,
					);
				}
				continue;
			}

			migrationHadPendingStatements = true;

			// Transform the statement for DSQL compatibility, currently just index stmts
			const transformedStmt = transformStatement(originalStmt);

			// Skip empty statements
			if (!transformedStmt) {
				// Still track it to maintain statement indices
				await db.execute(
					sql`INSERT INTO ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}
						(migration_hash, migration_folder_millis, statement_index, statement_hash)
						VALUES (${migration.hash}, ${migration.folderMillis}, ${stmtIdx}, ${currentStmtHash})`,
				);
				appliedStatementsCount++;
				continue;
			}

			try {
				await db.execute(sql.raw(transformedStmt));

				await db.execute(
					sql`INSERT INTO ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}
						(migration_hash, migration_folder_millis, statement_index, statement_hash)
						VALUES (${migration.hash}, ${migration.folderMillis}, ${stmtIdx}, ${currentStmtHash})`,
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
						sql: transformedStmt.length > 500
							? transformedStmt.slice(0, 500) + `... [truncated, ${transformedStmt.length - 500} more chars]`
							: transformedStmt,
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
	db: AwsDsqlDatabase<Record<string, unknown>>,
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
