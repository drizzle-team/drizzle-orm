import { CasingCache } from '~/casing.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { Placeholder } from '~/sql/index.ts';
import { Param, type QueryWithTypings, SQL, sql, type SQLChunk } from '~/sql/sql.ts';
import { SurrealDBColumn } from '~/surrealdb-core/columns/index.ts';
import { SurrealDBTable } from '~/surrealdb-core/table.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, Table } from '~/table.ts';
import { type Casing, orderSelectedFields, type UpdateSet } from '~/utils.ts';
import type { SelectedFieldsOrdered, SurrealDBSelectConfig } from './query-builders/select.types.ts';
import type { SurrealDBSession } from './session.ts';

export interface SurrealDBDialectConfig {
	casing?: Casing;
}

export interface SurrealDBDeleteConfig {
	table: SurrealDBTable;
	where?: SQL;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
	limit?: number;
	orderBy?: (SurrealDBColumn | SQL | SQL.Aliased)[];
}

export interface SurrealDBInsertConfig {
	table: SurrealDBTable;
	values: Record<string, SQL | Param>[];
	withList?: Subquery[];
	onConflict?: SQL;
	returning?: SelectedFieldsOrdered;
}

export interface SurrealDBUpdateConfig {
	table: SurrealDBTable;
	set: UpdateSet;
	where?: SQL;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
	limit?: number;
	orderBy?: (SurrealDBColumn | SQL | SQL.Aliased)[];
}

export class SurrealDBDialect {
	static readonly [entityKind]: string = 'SurrealDBDialect';

	/** @internal */
	readonly casing: CasingCache;

	constructor(config?: SurrealDBDialectConfig) {
		this.casing = new CasingCache(config?.casing);
	}

	escapeName(name: string): string {
		return `\`${name}\``;
	}

	escapeParam(num: number): string {
		return `$_${num + 1}`;
	}

	escapeString(str: string): string {
		return `'${str.replace(/'/g, "\\'")}'`;
	}

	private buildWithCTE(queries: Subquery[] | undefined): SQL | undefined {
		if (!queries?.length) return undefined;

		const withSqlChunks = [sql`with `];
		for (const [i, w] of queries.entries()) {
			withSqlChunks.push(sql`${sql.identifier(w._.alias)} as (${w._.sql})`);
			if (i < queries.length - 1) {
				withSqlChunks.push(sql`, `);
			}
		}
		withSqlChunks.push(sql` `);
		return sql.join(withSqlChunks);
	}

	buildDeleteQuery({ table, where, returning, withList }: SurrealDBDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` return ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`${withSql}delete from ${table}${whereSql}${returningSql}`;
	}

	buildUpdateSet(table: SurrealDBTable, set: UpdateSet): SQL {
		const tableColumns = table[Table.Symbol.Columns];

		const columnNames = Object.keys(tableColumns).filter((colName) =>
			set[colName] !== undefined || tableColumns[colName]?.onUpdateFn !== undefined
		);

		const setSize = columnNames.length;
		return sql.join(columnNames.flatMap((colName, i) => {
			const col = tableColumns[colName]!;

			const onUpdateFnResult = col.onUpdateFn?.();
			const value = set[colName] ?? (is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col));
			const res = sql`${sql.identifier(this.casing.getColumnCasing(col))} = ${value}`;

			if (i < setSize - 1) {
				return [res, sql.raw(', ')];
			}
			return [res];
		}));
	}

	buildUpdateQuery({ table, set, where, returning, withList }: SurrealDBUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const setSql = this.buildUpdateSet(table, set);

		const returningSql = returning
			? sql` return ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`${withSql}update ${table} set ${setSql}${whereSql}${returningSql}`;
	}

	buildSelection(
		fields: SelectedFieldsOrdered,
		{ isSingleTable = false }: { isSingleTable?: boolean } = {},
	): SQL {
		const columnsLen = fields.length;

		const chunks = fields.flatMap(({ field }, i) => {
			const chunk: SQLChunk[] = [];

			if (is(field, SQL.Aliased) && field.fieldAlias) {
				chunk.push(sql`${field.sql} as ${sql.identifier(field.fieldAlias)}`);
			} else if (is(field, SQL.Aliased) || is(field, SQL)) {
				chunk.push(field);
			} else if (is(field, Column)) {
				if (isSingleTable) {
					chunk.push(sql.identifier(this.casing.getColumnCasing(field)));
				} else {
					chunk.push(field);
				}
			}

			if (i < columnsLen - 1) {
				chunk.push(sql`, `);
			}

			return chunk;
		});

		return sql.join(chunks);
	}

	private buildLimit(limit: number | Placeholder | undefined): SQL | undefined {
		if (limit === undefined) return undefined;
		return sql` limit ${limit}`;
	}

	private buildOffset(offset: number | Placeholder | undefined): SQL | undefined {
		if (offset === undefined) return undefined;
		return sql` start ${offset}`;
	}

	private buildOrderBy(orderBy: (SurrealDBColumn | SQL | SQL.Aliased)[] | undefined): SQL | undefined {
		if (!orderBy || orderBy.length === 0) return undefined;

		const orderByChunks: SQLChunk[] = [sql` order by `];
		for (const [i, orderByValue] of orderBy.entries()) {
			if (i > 0) {
				orderByChunks.push(sql`, `);
			}
			orderByChunks.push(orderByValue);
		}

		return sql.join(orderByChunks);
	}

	buildSelectQuery({
		withList,
		fields,
		fieldsFlat,
		where,
		having,
		table,
		limit,
		offset,
		joins,
		orderBy,
		groupBy,
		distinct,
	}: SurrealDBSelectConfig): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<SurrealDBColumn>(fields);

		const isSingleTable = !joins || joins.length === 0;

		const withSql = this.buildWithCTE(withList);

		const distinctSql = distinct ? sql` distinct` : undefined;

		const selection = this.buildSelection(fieldsList, { isSingleTable });

		const tableSql = (() => {
			if (is(table, SurrealDBTable) && table[SurrealDBTable.Symbol.OriginalName] !== table[SurrealDBTable.Symbol.Name]) {
				return sql`${sql.identifier(table[SurrealDBTable.Symbol.OriginalName])} ${sql.identifier(table[SurrealDBTable.Symbol.Name])}`;
			}
			return table;
		})();

		const joinsSql = (() => {
			if (!joins || joins.length === 0) return undefined;

			return sql.join(joins.map((joinMeta) => {
				const table = joinMeta.table;
				const tableSql = is(table, SurrealDBTable) ? table : is(table, Subquery) ? table : table;

				return sql`${sql.raw(joinMeta.joinType)} join ${tableSql} on ${joinMeta.on}`;
			}));
		})();

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		const groupBySql = groupBy && groupBy.length > 0
			? sql` group by ${sql.join(groupBy, sql`, `)}`
			: undefined;

		const orderBySql = this.buildOrderBy(orderBy);
		const limitSql = this.buildLimit(limit);
		const offsetSql = this.buildOffset(offset);

		return sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery({ table, values, returning, withList }: SurrealDBInsertConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const isSingleValue = values.length === 1;
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, SurrealDBColumn> = table[Table.Symbol.Columns];

		const colEntries: [string, SurrealDBColumn][] = Object.entries(columns);

		const insertOrder = colEntries.map(([, column]) => sql.identifier(this.casing.getColumnCasing(column)));

		for (const [valueIndex, value] of values.entries()) {
			const valueList: (SQLChunk | SQL)[] = [];
			for (const [fieldName, col] of colEntries) {
				const colValue = value[fieldName];
				if (colValue === undefined || (is(colValue, Param) && colValue.value === undefined)) {
					if (col.defaultFn !== undefined) {
						const defaultFnResult = col.defaultFn();
						const defaultValue = is(defaultFnResult, SQL) ? defaultFnResult : sql.param(defaultFnResult, col);
						valueList.push(defaultValue);
					} else {
						valueList.push(sql`null`);
					}
				} else {
					valueList.push(colValue);
				}
			}
			valuesSqlList.push(valueList);
		}

		const returningSql = returning
			? sql` return ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const valuesSql = sql.join(
			valuesSqlList.map((row) => {
				if (Array.isArray(row)) {
					return sql`(${sql.join(row, sql`, `)})`;
				}
				return row;
			}),
			sql`, `,
		);

		return sql`${withSql}insert into ${table} (${sql.join(insertOrder, sql`, `)}) values ${valuesSql}${returningSql}`;
	}

	sqlToQuery(sql: SQL, invokeSource?: 'indexes' | undefined): QueryWithTypings {
		return sql.toQuery({
			casing: this.casing,
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			invokeSource,
		});
	}
}
