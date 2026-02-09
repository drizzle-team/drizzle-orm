import chalk from 'chalk';
import { sql } from 'drizzle-orm';
import { render } from 'hanji';
import type { DsqlCredentials } from '../validations/dsql';
import { withStyle } from '../validations/outputs';

/**
 * Result of a DSQL migration run with statement-level tracking.
 * Copied from drizzle-orm/dsql/migrator to avoid build-time dependency issues.
 */
interface DSQLMigrationResult {
	success: boolean;
	appliedStatements: number;
	totalStatements: number;
	completedMigrations: number;
	totalMigrations: number;
	error?: {
		message: string;
		migrationName: string;
		statementIndex: number;
		sql?: string;
	};
}

export interface MigrateDsqlConfig {
	out: string;
	credentials: DsqlCredentials;
	table?: string;
	schema?: string;
}

/**
 * Display pre-migration warning about DSQL's transaction limitations.
 */
function displayWarning(): void {
	console.log();
	console.log(withStyle.warning(`DSQL Migration Warning:`));
	console.log(
		chalk.yellow(
			`DSQL does not support transaction-wrapped DDL. Each statement executes`,
		),
	);
	console.log(
		chalk.yellow(
			`and commits individually. In case of failure:`,
		),
	);
	console.log(chalk.yellow(`  - Successfully applied statements remain in the database`));
	console.log(chalk.yellow(`  - Use 'drizzle-kit migrate' again after fixing the issue to resume`));
	console.log();
}

/**
 * Display successful migration result.
 */
function displaySuccess(result: DSQLMigrationResult): void {
	if (result.appliedStatements === 0) {
		render(`[${chalk.green('✓')}] No pending migrations to apply`);
	} else {
		render(
			`[${chalk.green('✓')}] Applied ${result.completedMigrations} migration${
				result.completedMigrations !== 1 ? 's' : ''
			} (${result.appliedStatements} statement${result.appliedStatements !== 1 ? 's' : ''})`,
		);
	}
}

/**
 * Display migration failure with recovery instructions.
 */
function displayFailure(result: DSQLMigrationResult): void {
	const error = result.error!;
	console.log();
	render(`[${chalk.red('✗')}] Migration failed at statement ${error.statementIndex + 1} of ${error.migrationName}`);
	console.log();
	console.log(chalk.gray(`Applied: ${result.appliedStatements} statement${result.appliedStatements !== 1 ? 's' : ''}`));
	console.log(chalk.red(`Error: ${error.message}`));
	if (error.sql) {
		console.log();
		console.log(chalk.gray(`Failed SQL:`));
		console.log(chalk.gray(error.sql));
	}
	console.log();
	console.log(chalk.cyan(`To recover:`));
	console.log(chalk.cyan(`  1. Fix the issue in your database or migration file`));
	console.log(chalk.cyan(`  2. Re-run: drizzle-kit migrate`));
	console.log();
}

/**
 * Handle DSQL migrations from CLI.
 */
export async function handle(config: MigrateDsqlConfig): Promise<void> {
	const { out, credentials, table, schema } = config;

	// Display warning about DSQL limitations
	displayWarning();

	// Connect to DSQL
	const { drizzle } = await import('drizzle-orm/dsql');

	const db = drizzle({
		connection: {
			host: credentials.host,
			region: credentials.region,
			user: credentials.user,
			database: credentials.database,
			port: credentials.port,
			profile: credentials.profile,
			tokenDurationSecs: credentials.tokenDurationSecs,
			max: credentials.max,
			connectionTimeoutMillis: credentials.connectionTimeoutMillis,
			idleTimeoutMillis: credentials.idleTimeoutMillis,
		},
	});

	// Test connection
	try {
		await db.execute(sql`SELECT 1`);
	} catch (e) {
		const error = e as Error;
		console.log();
		render(`[${chalk.red('✗')}] Failed to connect to DSQL: ${error.message}`);
		console.log();
		process.exit(1);
	}

	// Run migrations
	console.log(chalk.gray('Running migrations...'));
	console.log();

	// Dynamic import to avoid build-time dependency
	const { migrate } = await import('drizzle-orm/dsql/migrator');

	const result = await (migrate as (db: any, config: {
		migrationsFolder: string;
		migrationsTable?: string;
		migrationsSchema?: string;
	}) => Promise<DSQLMigrationResult>)(db, {
		migrationsFolder: out,
		migrationsTable: table,
		migrationsSchema: schema,
	});

	if (result.success) {
		displaySuccess(result);
	} else {
		displayFailure(result);
		process.exit(1);
	}
}
