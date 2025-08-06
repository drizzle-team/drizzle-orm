import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SQL, sql } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import type { SingleStoreDialect } from './dialect.ts';

/**
 * Temporary table builder for creating temporary tables from queries.
 */
export class SingleStoreTempTableBuilder {
	static readonly [entityKind]: string = 'SingleStoreTempTableBuilder';

	constructor(
		public readonly name: string,
		private readonly executeQuery: (sql: SQL) => Promise<any>,
		private readonly dialect: SingleStoreDialect,
	) {}

	/**
	 * Creates a temporary table from a SELECT query.
	 */
	async as<TSelectedFields extends Record<string, unknown>>(
		query: TypedQueryBuilder<TSelectedFields> | SQL,
	): Promise<SingleStoreTempTable<TSelectedFields> & TSelectedFields> {
		let querySQL: SQL;
		if ('getSQL' in query) {
			querySQL = query.getSQL();
		} else {
			querySQL = query;
		}

		// Build the CREATE TEMPORARY TABLE statement using SQL template
		// This preserves parameterization and prevents SQL injection
		const createTempTableSQL = sql`CREATE TEMPORARY TABLE ${sql.identifier(this.name)} AS ${querySQL}`;
		await this.executeQuery(createTempTableSQL);

		const selectedFields = 'getSelectedFields' in query
			? query.getSelectedFields()
			: ({} as TSelectedFields);

		const tempTable = new SingleStoreTempTable(this.name, selectedFields, this.executeQuery);

		return tempTable as SingleStoreTempTable<TSelectedFields> & TSelectedFields;
	}
}

/**
 * Helper type to infer select model from selected fields
 */
export type InferTempTableSelectModel<T extends SingleStoreTempTable<any>> = T extends
	SingleStoreTempTable<infer TSelectedFields> ? TSelectedFields
	: never;

/**
 * Helper type to infer insert model from selected fields (same as select for temp tables)
 */
export type InferTempTableInsertModel<T extends SingleStoreTempTable<any>> = InferTempTableSelectModel<T>;

/**
 * A temporary table that extends Subquery to be compatible with .from() clauses.
 */
export class SingleStoreTempTable<TSelectedFields extends Record<string, unknown> = Record<string, unknown>>
	extends Subquery<string, TSelectedFields>
{
	static override readonly [entityKind]: string = 'SingleStoreTempTable';

	declare readonly $inferSelect: TSelectedFields;
	declare readonly $inferInsert: TSelectedFields;

	constructor(
		public readonly tableName: string,
		public readonly selectedFields: TSelectedFields,
		private readonly executeQuery: (sql: SQL) => Promise<any>,
	) {
		super(
			sql`${sql.identifier(tableName)}`,
			selectedFields,
			tableName,
			false,
			[],
		);

		// Set up the table symbols like a real table to make temp table work properly
		(this as any)[Table.Symbol.Name] = tableName;
		(this as any)[Table.Symbol.OriginalName] = tableName;
		(this as any)[Table.Symbol.BaseName] = tableName;
		(this as any)[Table.Symbol.Schema] = undefined;
		(this as any)[Table.Symbol.IsAlias] = false;

		// Create column proxies that reference THIS temp table instead of the original table
		const builtColumns: Record<string, any> = {};

		for (const [key, column] of Object.entries(selectedFields)) {
			// If this is a column object, create a proxy that references this temp table
			if (column && typeof column === 'object' && 'table' in column) {
				// Create a new column object that points to our temp table
				const tempColumnProxy = Object.create(Object.getPrototypeOf(column));
				// Copy all properties from the original column
				Object.assign(tempColumnProxy, column);
				// But change the table reference to point to this temp table
				Object.defineProperty(tempColumnProxy, 'table', {
					value: this,
					writable: false,
					enumerable: true,
					configurable: false,
				});
				builtColumns[key] = tempColumnProxy;
			} else {
				// Not a column, keep as is
				builtColumns[key] = column;
			}
		}

		// Set up the column symbols
		(this as any)[Table.Symbol.Columns] = builtColumns;
		(this as any)[Table.Symbol.ExtraConfigColumns] = builtColumns;

		// Add columns as properties, avoiding conflicts with existing methods
		const safeSelectedFields = Object.fromEntries(
			Object.entries(builtColumns).filter(([key]) => !(key in this)),
		);
		Object.assign(this, safeSelectedFields);
	}

	/**
	 * Override getSQL to return just the table identifier without parentheses.
	 */
	override getSQL(): SQL {
		return sql`${sql.identifier(this.tableName)}`;
	}

	/**
	 * Prevents the temp table from being wrapped in parentheses in SQL generation.
	 */
	override shouldOmitSQLParens(): boolean {
		return true;
	}

	/**
	 * Drop the temporary table.
	 */
	async drop(): Promise<void> {
		const dropSQL = sql`DROP TEMPORARY TABLE ${sql.identifier(this.tableName)}`;
		await this.executeQuery(dropSQL);
	}
}
