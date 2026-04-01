import { entityKind, is } from '~/entity.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { type SQLiteTableFn, sqliteTableWithSchema } from './table.ts';
import { type sqliteView, sqliteViewWithSchema } from './view.ts';

/**
 * Represents a SQLite schema (database attached via ATTACH DATABASE).
 *
 * @example
 * ```typescript
 * const logs = sqliteSchema('logs');
 *
 * export const auditLog = logs.table('audit_log', {
 *   id: text('id').primaryKey(),
 *   action: text('action'),
 * });
 * ```
 */
export class SQLiteSchema<TName extends string = string> implements SQLWrapper {
	static readonly [entityKind]: string = 'SQLiteSchema';

	constructor(public readonly schemaName: TName) {}

	/**
	 * Define a table in this schema.
	 * Queries will generate: SELECT * FROM "schemaName"."tableName"
	 */
	table: SQLiteTableFn<TName> = ((name, columns, extraConfig) => {
		return sqliteTableWithSchema(name, columns, extraConfig, this.schemaName);
	}) as SQLiteTableFn<TName>;

	/**
	 * Define a view in this schema.
	 */
	view = ((name, columns) => {
		return sqliteViewWithSchema(name, columns, this.schemaName);
	}) as typeof sqliteView;

	getSQL(): SQL {
		return new SQL([sql.identifier(this.schemaName)]);
	}

	shouldOmitSQLParens(): boolean {
		return true;
	}
}

export function isSQLiteSchema(obj: unknown): obj is SQLiteSchema {
	return is(obj, SQLiteSchema);
}

/**
 * Define a SQLite schema for use with ATTACH DATABASE.
 *
 * SQLite supports attaching multiple database files to a single connection.
 * Each attached database is accessed via a schema prefix.
 *
 * @param name - Schema name (must match ATTACH DATABASE ... AS name)
 *
 * @example
 * ```typescript
 * // 1. Define schema
 * const logs = sqliteSchema('logs');
 *
 * export const auditLog = logs.table('audit_log', {
 *   id: text('id').primaryKey(),
 *   timestamp: integer('timestamp'),
 * });
 *
 * // 2. Attach database
 * const db = drizzle(client, { schema: { auditLog } });
 * await db.$attach('logs', './logs.db');
 *
 * // 3. Query across databases
 * await db.select().from(auditLog).all();
 * // Generates: SELECT * FROM "logs"."audit_log"
 * ```
 */
export function sqliteSchema<T extends string>(name: T): SQLiteSchema<T> {
	return new SQLiteSchema(name);
}
