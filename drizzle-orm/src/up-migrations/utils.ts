import type { Query, SQL } from '~/sql/sql.ts';

export interface UpgradeResult {
	newDb: boolean;
}

export const GET_VERSION_FOR = {
	mysql: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
	pg: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
	effect: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
	mssql: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
	cockroach: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
	singlestore: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
	sqlite: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
} as const;

export interface MigrationRunner {
	/** Runs a statement, ignoring it's result */
	execute(query: SQL): unknown;
	/**
	 * Gives the rows of a query as objects. `columns` are the selected columns in order, for drivers that query rows as
	 * arrays (proxies)
	 */
	objects(query: SQL, columns: string[]): unknown;
	/** Runs the statements so that all of them apply or none: in a transaction, or the driver's equivalent */
	atomically(statements: SQL[]): unknown;
}

/** Gives the rows of an array-mode query as objects of `columns` */
export const arrayRowsToObjects = (rows: unknown[][], columns: string[]): Record<string, unknown>[] =>
	rows.map((row) => {
		const object: Record<string, unknown> = {};
		for (let i = 0; i < columns.length; ++i) object[columns[i]!] = row[i];
		return object;
	});

export function proxyMigrationRunner(
	dialect: { sqlToQuery(sql: SQL): Query },
	callback: (migrationQueries: string[]) => Promise<void>,
	queries: Pick<MigrationRunner, 'execute' | 'objects'>,
): MigrationRunner {
	return {
		execute: queries.execute,
		objects: queries.objects,
		atomically: (statements) =>
			callback(statements.map((statement) => dialect.sqlToQuery(statement.inlineParams()).sql)),
	};
}
