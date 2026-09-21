import type { Casing } from '~/utils.ts';
import { ClickHouseDialect } from './dialect.ts';
import type { ClickHouseTable } from './table.ts';

export interface ClickHouseDDLOptions {
	/** Column-name casing, matching the `casing` option passed to `drizzle()`. */
	casing?: Casing;
	/** Emits `ON CLUSTER <name>`, so the statement is replicated across a cluster. */
	onCluster?: string;
}

export interface CreateTableOptions extends ClickHouseDDLOptions {
	ifNotExists?: boolean;
}

export interface DropTableOptions extends ClickHouseDDLOptions {
	ifExists?: boolean;
	/** Waits for the data to actually be removed instead of returning as soon as the drop is queued. */
	sync?: boolean;
}

/**
 * Renders the `CREATE TABLE` statement for a table declared with `clickhouseTable`.
 *
 * ```ts
 * await db.execute(createTableSQL(events, { ifNotExists: true }));
 * ```
 */
export function createTableSQL(table: ClickHouseTable, options: CreateTableOptions = {}): string {
	const dialect = new ClickHouseDialect({ casing: options.casing });
	// DDL refers to columns by bare name; `'indexes'` is what suppresses the `table`.`column` form.
	return dialect.sqlToQuery(dialect.buildCreateTableQuery(table, options), 'indexes').sql;
}

/**
 * Renders the `DROP TABLE` statement for a table declared with `clickhouseTable`.
 *
 * ```ts
 * await db.execute(dropTableSQL(events, { ifExists: true }));
 * ```
 */
export function dropTableSQL(table: ClickHouseTable, options: DropTableOptions = {}): string {
	const dialect = new ClickHouseDialect({ casing: options.casing });
	return dialect.sqlToQuery(dialect.buildDropTableQuery(table, options), 'indexes').sql;
}
