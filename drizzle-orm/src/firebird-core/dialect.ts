import { aliasedTable, aliasedTableColumn, mapColumnsInAliasedSQLToAlias, mapColumnsInSQLToAlias } from '~/alias.ts';
import { CasingCache } from '~/casing.ts';
import type { AnyColumn } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import { FirebirdColumn } from '~/firebird-core/columns/index.ts';
import type {
	AnyFirebirdSelectQueryBuilder,
	FirebirdDeleteConfig,
	FirebirdInsertConfig,
	FirebirdUpdateConfig,
} from '~/firebird-core/query-builders/index.ts';
import { FirebirdTable } from '~/firebird-core/table.ts';
import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import {
	type BuildRelationalQueryResult,
	type DBQueryConfig,
	getOperators,
	getOrderByOperators,
	Many,
	normalizeRelation,
	One,
	type Relation,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { Name, Placeholder } from '~/sql/index.ts';
import { and, eq } from '~/sql/index.ts';
import { Param, type QueryWithTypings, SQL, sql, type SQLChunk } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, getTableUniqueName, Table } from '~/table.ts';
import { type Casing, orderSelectedFields, type UpdateSet } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type {
	FirebirdSelectConfig,
	FirebirdSelectJoinConfig,
	SelectedFieldsOrdered,
} from './query-builders/select.types.ts';
import type { FirebirdSession } from './session.ts';
import { FirebirdViewBase } from './view-base.ts';

export interface FirebirdDialectConfig {
	casing?: Casing;
}

export abstract class FirebirdDialect {
	static readonly [entityKind]: string = 'FirebirdDialect';

	/** @internal */
	readonly casing: CasingCache;

	constructor(config?: FirebirdDialectConfig) {
		this.casing = new CasingCache(config?.casing);
	}

	escapeName(name: string): string {
		return `"${name.replace(/"/g, '""')}"`;
	}

	escapeParam(_num: number): string {
		return '?';
	}

	escapeString(str: string): string {
		return `'${str.replace(/'/g, "''")}'`;
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

	buildDeleteQuery({
		table,
		where,
		returning,
		withList,
		limit,
		orderBy,
	}: FirebirdDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const limitSql = this.buildRows(limit);

		return sql`${withSql}delete from ${table}${whereSql}${orderBySql}${limitSql}${returningSql}`;
	}

	buildUpdateSet(table: FirebirdTable, set: UpdateSet): SQL {
		const tableColumns = table[Table.Symbol.Columns];

		const columnNames = Object.keys(tableColumns).filter(
			(colName) =>
				set[colName] !== undefined
				|| tableColumns[colName]?.onUpdateFn !== undefined,
		);

		const setSize = columnNames.length;
		return sql.join(
			columnNames.flatMap((colName, i) => {
				const col = tableColumns[colName]!;

				const onUpdateFnResult = col.onUpdateFn?.();
				const value = set[colName]
					?? (is(onUpdateFnResult, SQL)
						? onUpdateFnResult
						: sql.param(onUpdateFnResult, col));
				const res = sql`${sql.identifier(this.casing.getColumnCasing(col))} = ${value}`;

				if (i < setSize - 1) {
					return [res, sql.raw(', ')];
				}
				return [res];
			}),
		);
	}

	buildUpdateQuery({
		table,
		set,
		where,
		returning,
		withList,
		joins,
		from,
		limit,
		orderBy,
	}: FirebirdUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const setSql = this.buildUpdateSet(table, set);

		const fromSql = from && sql.join([sql.raw(' from '), this.buildFromTable(from)]);

		const joinsSql = this.buildJoins(joins);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const limitSql = this.buildRows(limit);

		return sql`${withSql}update ${table} set ${setSql}${fromSql}${joinsSql}${whereSql}${orderBySql}${limitSql}${returningSql}`;
	}

	/**
	 * Builds selection SQL with provided fields/expressions
	 *
	 * Examples:
	 *
	 * `select <selection> from`
	 *
	 * `insert ... returning <selection>`
	 *
	 * If `isSingleTable` is true, then columns won't be prefixed with table name
	 */
	private buildSelection(
		fields: SelectedFieldsOrdered,
		{ isSingleTable = false, tableAlias }: { isSingleTable?: boolean; tableAlias?: string } = {},
	): SQL {
		const columnsLen = fields.length;

		const chunks = fields.flatMap(({ field }, i) => {
			const chunk: SQLChunk[] = [];

			if (is(field, SQL.Aliased) && field.isSelectionField) {
				chunk.push(sql.identifier(field.fieldAlias));
			} else if (is(field, Column)) {
				const tableName = field.table[Table.Symbol.Name];
				const columnSql = tableAlias
					? sql`${sql.identifier(tableAlias)}.${sql.identifier(this.casing.getColumnCasing(field))}`
					: isSingleTable
					? sql.identifier(this.casing.getColumnCasing(field))
					: sql`${sql.identifier(tableName)}.${sql.identifier(this.casing.getColumnCasing(field))}`;
				if (
					field.columnType === 'FirebirdBigInt64'
					|| field.columnType === 'FirebirdNumericBigInt'
					|| field.columnType === 'FirebirdTime'
				) {
					chunk.push(sql`cast(${columnSql} as varchar(8191))`);
				} else {
					chunk.push(columnSql);
				}
			} else if (is(field, SQL.Aliased) || is(field, SQL)) {
				const query = tableAlias
					? mapColumnsInSQLToAlias(is(field, SQL.Aliased) ? field.sql : field, tableAlias)
					: is(field, SQL.Aliased)
					? field.sql
					: field;

				if (isSingleTable) {
					chunk.push(
						new SQL(
							query.queryChunks.map((c) => {
								if (is(c, Column)) {
									return sql.identifier(this.casing.getColumnCasing(c));
								}
								return c;
							}),
						),
					);
				} else {
					chunk.push(query);
				}

				if (is(field, SQL.Aliased)) {
					chunk.push(sql` as ${sql.identifier(field.fieldAlias)}`);
				}
			} else if (is(field, Subquery)) {
				const entries = Object.entries(field._.selectedFields) as [
					string,
					SQL.Aliased | Column | SQL,
				][];

				if (entries.length === 1) {
					const entry = entries[0]![1];

					const fieldDecoder = is(entry, SQL)
						? entry.decoder
						: is(entry, Column)
						? { mapFromDriverValue: (v: any) => entry.mapFromDriverValue(v) }
						: entry.sql.decoder;
					if (fieldDecoder) field._.sql.decoder = fieldDecoder;
				}
				chunk.push(field);
			}

			if (i < columnsLen - 1) {
				chunk.push(sql`, `);
			}

			return chunk;
		});

		return sql.join(chunks);
	}

	private buildJoins(
		joins: FirebirdSelectJoinConfig[] | undefined,
	): SQL | undefined {
		if (!joins || joins.length === 0) {
			return undefined;
		}

		const joinsArray: SQL[] = [];

		if (joins) {
			for (const [index, joinMeta] of joins.entries()) {
				if (index === 0) {
					joinsArray.push(sql` `);
				}
				const table = joinMeta.table;
				const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : undefined;

				if (is(table, FirebirdTable)) {
					const tableName = table[FirebirdTable.Symbol.Name];
					const tableSchema = table[FirebirdTable.Symbol.Schema];
					const origTableName = table[FirebirdTable.Symbol.OriginalName];
					const alias = tableName === origTableName ? undefined : joinMeta.alias;
					joinsArray.push(
						sql`${sql.raw(joinMeta.joinType)} join ${tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined}${
							sql.identifier(
								origTableName,
							)
						}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
					);
				} else {
					joinsArray.push(
						sql`${sql.raw(joinMeta.joinType)} join ${table}${onSql}`,
					);
				}
				if (index < joins.length - 1) {
					joinsArray.push(sql` `);
				}
			}
		}

		return sql.join(joinsArray);
	}

	private buildRows(limit: number | Placeholder | undefined): SQL | undefined {
		return typeof limit === 'object'
				|| (typeof limit === 'number' && limit >= 0)
			? sql` rows ${limit}`
			: undefined;
	}

	private buildOffsetFetch(
		limit: number | Placeholder | undefined,
		offset: number | Placeholder | undefined,
	): SQL | undefined {
		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` fetch first ${limit} rows only`
			: undefined;
		const offsetSql = offset ? sql` offset ${offset} rows` : undefined;

		return offsetSql || limitSql ? sql`${offsetSql}${limitSql}` : undefined;
	}

	private buildOrderBy(
		orderBy: (FirebirdColumn | SQL | SQL.Aliased)[] | undefined,
	): SQL | undefined {
		const orderByList: (FirebirdColumn | SQL | SQL.Aliased)[] = [];

		if (orderBy) {
			for (const [index, orderByValue] of orderBy.entries()) {
				orderByList.push(orderByValue);

				if (index < orderBy.length - 1) {
					orderByList.push(sql`, `);
				}
			}
		}

		return orderByList.length > 0
			? sql` order by ${sql.join(orderByList)}`
			: undefined;
	}

	private buildFromTable(
		table: SQL | Subquery | FirebirdViewBase | FirebirdTable | undefined,
	): SQL | Subquery | FirebirdViewBase | FirebirdTable | undefined {
		if (is(table, Table) && table[Table.Symbol.IsAlias]) {
			return sql`${sql`${sql.identifier(table[Table.Symbol.Schema] ?? '')}.`.if(table[Table.Symbol.Schema])}${
				sql.identifier(
					table[Table.Symbol.OriginalName],
				)
			} ${sql.identifier(table[Table.Symbol.Name])}`;
		}

		return table;
	}

	buildSelectQuery({
		withList,
		fields,
		fieldsFlat,
		where,
		having,
		table,
		joins,
		orderBy,
		groupBy,
		limit,
		offset,
		distinct,
		setOperators,
	}: FirebirdSelectConfig): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<FirebirdColumn>(fields);
		for (const f of fieldsList) {
			if (
				is(f.field, Column)
				&& getTableName(f.field.table)
					!== (is(table, Subquery)
						? table._.alias
						: is(table, FirebirdViewBase)
						? table[ViewBaseConfig].name
						: is(table, SQL)
						? undefined
						: getTableName(table))
				&& !((table) =>
					joins?.some(
						({ alias }) =>
							alias
								=== (table[Table.Symbol.IsAlias]
									? getTableName(table)
									: table[Table.Symbol.BaseName]),
					))(f.field.table)
			) {
				const tableName = getTableName(f.field.table);
				throw new Error(
					`Your "${
						f.path.join(
							'->',
						)
					}" field references a column "${tableName}"."${f.field.name}", but the table "${tableName}" is not part of the query! Did you forget to join it?`,
				);
			}
		}

		const isSingleTable = !joins || joins.length === 0;

		const withSql = this.buildWithCTE(withList);

		const distinctSql = distinct ? sql` distinct` : undefined;

		const selection = this.buildSelection(fieldsList, { isSingleTable });

		const tableSql = this.buildFromTable(table);

		const joinsSql = this.buildJoins(joins);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		const groupByList: (SQL | AnyColumn | SQL.Aliased)[] = [];
		if (groupBy) {
			for (const [index, groupByValue] of groupBy.entries()) {
				groupByList.push(groupByValue);

				if (index < groupBy.length - 1) {
					groupByList.push(sql`, `);
				}
			}
		}

		const groupBySql = groupByList.length > 0
			? sql` group by ${sql.join(groupByList)}`
			: undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const offsetFetchSql = this.buildOffsetFetch(limit, offset);

		const finalQuery =
			sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${offsetFetchSql}`;

		if (setOperators.length > 0) {
			return this.buildSetOperations(finalQuery, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		setOperators: FirebirdSelectConfig['setOperators'],
	): SQL {
		const [setOperator, ...rest] = setOperators;

		if (!setOperator) {
			throw new Error('Cannot pass undefined values to any set operator');
		}

		if (rest.length === 0) {
			return this.buildSetOperationQuery({ leftSelect, setOperator });
		}

		// Some recursive magic here
		return this.buildSetOperations(
			this.buildSetOperationQuery({ leftSelect, setOperator }),
			rest,
		);
	}

	buildSetOperationQuery({
		leftSelect,
		setOperator: { type, isAll, rightSelect, limit, orderBy, offset },
	}: {
		leftSelect: SQL;
		setOperator: FirebirdSelectConfig['setOperators'][number];
	}): SQL {
		// Firebird doesn't support parenthesis in set operations
		const leftChunk = sql`${leftSelect.getSQL()} `;
		const rightChunk = sql`${rightSelect.getSQL()}`;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: (SQL<unknown> | Name)[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid Sql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const singleOrderBy of orderBy) {
				if (is(singleOrderBy, FirebirdColumn)) {
					orderByValues.push(sql.identifier(singleOrderBy.name));
				} else if (is(singleOrderBy, SQL)) {
					for (let i = 0; i < singleOrderBy.queryChunks.length; i++) {
						const chunk = singleOrderBy.queryChunks[i];

						if (is(chunk, FirebirdColumn)) {
							singleOrderBy.queryChunks[i] = sql.identifier(
								this.casing.getColumnCasing(chunk),
							);
						}
					}

					orderByValues.push(sql`${singleOrderBy}`);
				} else {
					orderByValues.push(sql`${singleOrderBy}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)}`;
		}

		const operatorChunk = sql.raw(`${type} ${isAll ? 'all ' : ''}`);

		const offsetFetchSql = this.buildOffsetFetch(limit, offset);

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${offsetFetchSql}`;
	}

	private getInsertColumnEntries(table: FirebirdTable): [string, FirebirdColumn][] {
		const columns: Record<string, FirebirdColumn> = table[Table.Symbol.Columns];
		return Object.entries(columns).filter(
			([_, col]) => !col.shouldDisableInsert(),
		);
	}

	private buildInsertDefaultValue(col: FirebirdColumn): { value: Param | SQL; isDefault: boolean } {
		if (col.default !== null && col.default !== undefined) {
			return {
				value: is(col.default, SQL) ? col.default : sql.param(col.default, col),
				isDefault: false,
			};
		}
		if (col.defaultFn !== undefined) {
			const defaultFnResult = col.defaultFn();
			return {
				value: is(defaultFnResult, SQL) ? defaultFnResult : sql.param(defaultFnResult, col),
				isDefault: false,
			};
		}
		if (!col.default && col.onUpdateFn !== undefined) {
			const onUpdateFnResult = col.onUpdateFn();
			return {
				value: is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col),
				isDefault: false,
			};
		}
		if (col.hasDefault || col.generatedIdentity !== undefined) {
			return { value: sql`default`, isDefault: true };
		}
		return { value: sql`null`, isDefault: false };
	}

	private buildInsertRow(
		colEntries: [string, FirebirdColumn][],
		value: Record<string, Param | SQL>,
	): Record<string, { column: FirebirdColumn; fieldName: string; value: Param | SQL; isDefault: boolean }> {
		const row: Record<string, { column: FirebirdColumn; fieldName: string; value: Param | SQL; isDefault: boolean }> =
			{};

		for (const [fieldName, col] of colEntries) {
			const colValue = value[fieldName];
			if (
				colValue === undefined
				|| (is(colValue, Param) && colValue.value === undefined)
			) {
				row[fieldName] = { fieldName, column: col, ...this.buildInsertDefaultValue(col) };
			} else {
				row[fieldName] = { fieldName, column: col, value: colValue, isDefault: false };
			}
		}

		return row;
	}

	private resolveConflictTargetColumns(
		table: FirebirdTable,
		target: NonNullable<FirebirdInsertConfig['onConflict']>['target'],
	): FirebirdColumn[] {
		if (target === undefined) {
			const primaryColumns = Object.values(table[Table.Symbol.Columns] as Record<string, FirebirdColumn>)
				.filter((column) => column.primary);
			if (primaryColumns.length === 0) {
				throw new Error(
					'Firebird onConflictDoNothing() requires a conflict target when the table has no primary key.',
				);
			}
			return primaryColumns;
		}

		const targets = Array.isArray(target) ? target : [target];
		return targets.map((targetColumn) => {
			if (!is(targetColumn, FirebirdColumn)) {
				throw new Error('Firebird upsert conflict targets must be table columns.');
			}
			return targetColumn;
		});
	}

	private getColumnFieldName(
		table: FirebirdTable,
		column: FirebirdColumn,
	): string {
		const entry = Object.entries(table[Table.Symbol.Columns] as Record<string, FirebirdColumn>)
			.find(([, tableColumn]) => tableColumn === column);
		if (!entry) {
			throw new Error(`Column "${column.name}" is not part of table "${getTableName(table)}".`);
		}
		return entry[0];
	}

	private buildMergeSource(
		rows: Record<string, { column: FirebirdColumn; fieldName: string; value: Param | SQL; isDefault: boolean }>[],
		sourceColumns: { fieldName: string; column: FirebirdColumn }[],
	): SQL {
		const sourceSelects = rows.map((row) => {
			const selection = sourceColumns.map(({ fieldName, column }) => {
				const entry = row[fieldName]!;
				if (entry.isDefault) {
					throw new Error(
						`Firebird upsert cannot mix DEFAULT and explicit values for column "${column.name}" in the MERGE source.`,
					);
				}
				return sql`cast(${entry.value} as ${sql.raw(column.getSQLType())}) as ${
					sql.identifier(this.casing.getColumnCasing(column))
				}`;
			});

			return sql`select ${sql.join(selection, sql`, `)} from rdb$database`;
		});

		return sql.join(sourceSelects, sql` union all `);
	}

	private buildMergeReturning(
		returning: SelectedFieldsOrdered | undefined,
		targetAlias: string,
	): SQL | undefined {
		return returning
			? sql` returning ${this.buildSelection(returning, { tableAlias: targetAlias })}`
			: undefined;
	}

	private buildInsertOnConflictQuery({
		table,
		values: valuesOrSelect,
		onConflict,
		returning,
		withList,
		select,
	}: FirebirdInsertConfig): SQL {
		if (!onConflict) {
			throw new Error('Firebird insert conflict config is missing.');
		}
		if (select) {
			throw new Error('Firebird upsert does not support insert-from-select queries yet.');
		}
		if (withList?.length) {
			throw new Error('Firebird upsert does not support WITH clauses yet.');
		}

		const values = valuesOrSelect as Record<string, Param | SQL>[];
		const colEntries = this.getInsertColumnEntries(table);
		const rows = values.map((value) => this.buildInsertRow(colEntries, value));
		const targetAlias = '__drizzle_target';
		const sourceAlias = '__drizzle_source';
		const targetColumns = this.resolveConflictTargetColumns(table, onConflict.target);
		const targetFieldNames = targetColumns.map((column) => this.getColumnFieldName(table, column));
		const insertColumns = colEntries
			.map(([fieldName, column]) => ({ fieldName, column }))
			.filter(({ fieldName }) => rows.some((row) => !row[fieldName]!.isDefault));
		const sourceColumnNames = new Set(insertColumns.map(({ fieldName }) => fieldName));

		for (const fieldName of targetFieldNames) {
			if (!sourceColumnNames.has(fieldName)) {
				throw new Error(
					`Firebird upsert conflict target column "${fieldName}" must have an explicit insert value.`,
				);
			}
		}

		const sourceSql = this.buildMergeSource(rows, insertColumns);
		const onConditions = targetColumns.map((column) =>
			sql`${sql.identifier(targetAlias)}.${sql.identifier(this.casing.getColumnCasing(column))} = ${
				sql.identifier(sourceAlias)
			}.${sql.identifier(this.casing.getColumnCasing(column))}`
		);
		const targetWhereSql = onConflict.type === 'doUpdate' && onConflict.targetWhere
			? mapColumnsInSQLToAlias(onConflict.targetWhere, targetAlias)
			: onConflict.type === 'doNothing' && onConflict.where
			? mapColumnsInSQLToAlias(onConflict.where, targetAlias)
			: undefined;
		const onSql = sql.join(
			targetWhereSql ? [...onConditions, targetWhereSql] : onConditions,
			sql` and `,
		);
		const insertOrder = insertColumns.map(({ column }) => sql.identifier(this.casing.getColumnCasing(column)));
		const insertValues = insertColumns.map(({ column }) =>
			sql`${sql.identifier(sourceAlias)}.${sql.identifier(this.casing.getColumnCasing(column))}`
		);
		const returningSql = this.buildMergeReturning(returning, targetAlias);

		if (onConflict.type === 'doNothing') {
			return sql`merge into ${table} ${sql.identifier(targetAlias)} using (${sourceSql}) ${
				sql.identifier(sourceAlias)
			} on (${onSql}) when not matched then insert ${insertOrder} values ${insertValues}${returningSql}`;
		}

		const setWhere = onConflict.where ?? onConflict.setWhere;
		const setWhereSql = setWhere ? sql` and ${mapColumnsInSQLToAlias(setWhere, targetAlias)}` : undefined;
		const setSql = this.buildUpdateSet(table, onConflict.set);

		return sql`merge into ${table} ${sql.identifier(targetAlias)} using (${sourceSql}) ${
			sql.identifier(sourceAlias)
		} on (${onSql}) when matched${setWhereSql} then update set ${setSql} when not matched then insert ${insertOrder} values ${insertValues}${returningSql}`;
	}

	buildInsertQuery({
		table,
		values: valuesOrSelect,
		onConflict,
		returning,
		withList,
		select,
	}: FirebirdInsertConfig): SQL {
		if (onConflict) {
			return this.buildInsertOnConflictQuery({
				table,
				values: valuesOrSelect,
				onConflict,
				returning,
				withList,
				select,
			});
		}

		// const isSingleValue = values.length === 1;
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];

		const colEntries = this.getInsertColumnEntries(table);
		const insertOrder = colEntries.map(([, column]) => sql.identifier(this.casing.getColumnCasing(column)));

		if (select) {
			const select = valuesOrSelect as AnyFirebirdSelectQueryBuilder | SQL;

			if (is(select, SQL)) {
				valuesSqlList.push(select);
			} else {
				valuesSqlList.push(select.getSQL());
			}
		} else {
			const values = valuesOrSelect as Record<string, Param | SQL>[];

			if (values.length === 1) {
				valuesSqlList.push(sql.raw('values '));

				for (const [valueIndex, value] of values.entries()) {
					const valueList: (SQLChunk | SQL)[] = [];
					for (const [fieldName, col] of colEntries) {
						const colValue = value[fieldName];
						if (
							colValue === undefined
							|| (is(colValue, Param) && colValue.value === undefined)
						) {
							valueList.push(this.buildInsertDefaultValue(col).value);
						} else {
							valueList.push(colValue);
						}
					}
					valuesSqlList.push(valueList);
					if (valueIndex < values.length - 1) {
						valuesSqlList.push(sql`, `);
					}
				}
			} else {
				const rows = values.map((value) => this.buildInsertRow(colEntries, value));
				const insertColumns = colEntries
					.map(([fieldName, column]) => ({ fieldName, column }))
					.filter(({ fieldName }) => rows.some((row) => !row[fieldName]!.isDefault));

				const selectRows = rows.map((row) => {
					const selectValues = insertColumns.map(({ fieldName, column }) => {
						const entry = row[fieldName]!;
						if (entry.isDefault) {
							throw new Error(
								`Firebird multi-row insert cannot mix DEFAULT and explicit values for column "${column.name}".`,
							);
						}
						return sql`cast(${entry.value} as ${sql.raw(column.getSQLType())})`;
					});
					return sql`select ${sql.join(selectValues, sql`, `)} from rdb$database`;
				});
				valuesSqlList.push(sql.join(selectRows, sql` union all `));
				insertOrder.length = 0;
				insertOrder.push(...insertColumns.map(({ column }) => sql.identifier(this.casing.getColumnCasing(column))));
				if (insertOrder.length === 0) {
					throw new Error('Firebird multi-row insert requires at least one explicit column value.');
				}
			}
		}

		const withSql = this.buildWithCTE(withList);

		const valuesSql = sql.join(valuesSqlList);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		// if (isSingleValue && valuesSqlList.length === 0){
		// 	return sql`insert into ${table} default values ${onConflictSql}${returningSql}`;
		// }

		return sql`${withSql}insert into ${table} ${insertOrder} ${valuesSql}${returningSql}`;
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

	private buildJsonString(value: SQL): SQL {
		const textValue = sql`cast(${value} as varchar(8191))`;
		return sql`case when ${value} is null then 'null' else ascii_char(34) || replace(replace(replace(replace(replace(${textValue}, ascii_char(92), ascii_char(92) || ascii_char(92)), ascii_char(34), ascii_char(92) || ascii_char(34)), ascii_char(13), ascii_char(92) || 'r'), ascii_char(10), ascii_char(92) || 'n'), ascii_char(9), ascii_char(92) || 't') || ascii_char(34) end`;
	}

	private buildJsonValue(field: FirebirdColumn | SQL | SQL.Aliased, isJson: boolean): SQL {
		const value = is(field, FirebirdColumn)
			? sql.identifier(this.casing.getColumnCasing(field))
			: is(field, SQL.Aliased)
			? field.sql
			: field;

		if (isJson) {
			return sql`coalesce(cast(${value} as varchar(8191)), 'null')`;
		}

		if (is(field, FirebirdColumn)) {
			if (field.dataType === 'boolean') {
				return sql`case when ${value} is null then 'null' when ${value} then 'true' else 'false' end`;
			}
			if (field.dataType === 'number') {
				return sql`case when ${value} is null then 'null' else cast(${value} as varchar(8191)) end`;
			}
			if (field.dataType === 'bigint') {
				return this.buildJsonString(sql`cast(${value} as varchar(8191))`);
			}
		}

		return this.buildJsonString(sql`${value}`);
	}

	buildRelationalQuery({
		fullSchema,
		schema,
		tableNamesMap,
		table,
		tableConfig,
		queryConfig: config,
		tableAlias,
		nestedQueryRelation,
		joinOn,
	}: {
		fullSchema: Record<string, unknown>;
		schema: TablesRelationalConfig;
		tableNamesMap: Record<string, string>;
		table: FirebirdTable;
		tableConfig: TableRelationalConfig;
		queryConfig: true | DBQueryConfig<'many', true>;
		tableAlias: string;
		nestedQueryRelation?: Relation;
		joinOn?: SQL;
	}): BuildRelationalQueryResult<FirebirdTable, FirebirdColumn> {
		let selection: BuildRelationalQueryResult<
			FirebirdTable,
			FirebirdColumn
		>['selection'] = [];
		let limit,
			offset,
			orderBy: FirebirdSelectConfig['orderBy'] = [],
			where;
		const joins: FirebirdSelectJoinConfig[] = [];

		if (config === true) {
			const selectionEntries = Object.entries(tableConfig.columns);
			selection = selectionEntries.map(([key, value]) => ({
				dbKey: value.name,
				tsKey: key,
				field: aliasedTableColumn(value as FirebirdColumn, tableAlias),
				relationTableTsKey: undefined,
				isJson: false,
				selection: [],
			}));
		} else {
			const aliasedColumns = Object.fromEntries(
				Object.entries(tableConfig.columns).map(([key, value]) => [
					key,
					aliasedTableColumn(value, tableAlias),
				]),
			);

			if (config.where) {
				const whereSql = typeof config.where === 'function'
					? config.where(aliasedColumns, getOperators())
					: config.where;
				where = whereSql && mapColumnsInSQLToAlias(whereSql, tableAlias);
			}

			const fieldsSelection: {
				tsKey: string;
				value: FirebirdColumn | SQL.Aliased;
			}[] = [];
			let selectedColumns: string[] = [];

			// Figure out which columns to select
			if (config.columns) {
				let isIncludeMode = false;

				for (const [field, value] of Object.entries(config.columns)) {
					if (value === undefined) {
						continue;
					}

					if (field in tableConfig.columns) {
						if (!isIncludeMode && value === true) {
							isIncludeMode = true;
						}
						selectedColumns.push(field);
					}
				}

				if (selectedColumns.length > 0) {
					selectedColumns = isIncludeMode
						? selectedColumns.filter((c) => config.columns?.[c] === true)
						: Object.keys(tableConfig.columns).filter(
							(key) => !selectedColumns.includes(key),
						);
				}
			} else {
				// Select all columns if selection is not specified
				selectedColumns = Object.keys(tableConfig.columns);
			}

			for (const field of selectedColumns) {
				const column = tableConfig.columns[field]! as FirebirdColumn;
				fieldsSelection.push({ tsKey: field, value: column });
			}

			let selectedRelations: {
				tsKey: string;
				queryConfig: true | DBQueryConfig<'many', false>;
				relation: Relation;
			}[] = [];

			// Figure out which relations to select
			if (config.with) {
				selectedRelations = Object.entries(config.with)
					.filter(
						(
							entry,
						): entry is [(typeof entry)[0], NonNullable<(typeof entry)[1]>] => !!entry[1],
					)
					.map(([tsKey, queryConfig]) => ({
						tsKey,
						queryConfig,
						relation: tableConfig.relations[tsKey]!,
					}));
			}

			let extras;

			// Figure out which extras to select
			if (config.extras) {
				extras = typeof config.extras === 'function'
					? config.extras(aliasedColumns, { sql })
					: config.extras;
				for (const [tsKey, value] of Object.entries(extras)) {
					fieldsSelection.push({
						tsKey,
						value: mapColumnsInAliasedSQLToAlias(value, tableAlias),
					});
				}
			}

			// Transform `fieldsSelection` into `selection`
			// `fieldsSelection` shouldn't be used after this point
			for (const { tsKey, value } of fieldsSelection) {
				selection.push({
					dbKey: is(value, SQL.Aliased)
						? value.fieldAlias
						: tableConfig.columns[tsKey]!.name,
					tsKey,
					field: is(value, Column)
						? aliasedTableColumn(value, tableAlias)
						: value,
					relationTableTsKey: undefined,
					isJson: false,
					selection: [],
				});
			}

			let orderByOrig = typeof config.orderBy === 'function'
				? config.orderBy(aliasedColumns, getOrderByOperators())
				: (config.orderBy ?? []);
			if (!Array.isArray(orderByOrig)) {
				orderByOrig = [orderByOrig];
			}
			orderBy = orderByOrig.map((orderByValue) => {
				if (is(orderByValue, Column)) {
					return aliasedTableColumn(orderByValue, tableAlias) as FirebirdColumn;
				}
				return mapColumnsInSQLToAlias(orderByValue, tableAlias);
			});

			limit = config.limit;
			offset = config.offset;

			// Process all relations
			for (
				const {
					tsKey: selectedRelationTsKey,
					queryConfig: selectedRelationConfigValue,
					relation,
				} of selectedRelations
			) {
				const normalizedRelation = normalizeRelation(
					schema,
					tableNamesMap,
					relation,
				);
				const relationTableName = getTableUniqueName(relation.referencedTable);
				const relationTableTsName = tableNamesMap[relationTableName]!;
				const relationTableAlias = `${tableAlias}_${selectedRelationTsKey}`;
				// const relationTable = schema[relationTableTsName]!;
				const joinOn = and(
					...normalizedRelation.fields.map((field, i) =>
						eq(
							aliasedTableColumn(
								normalizedRelation.references[i]!,
								relationTableAlias,
							),
							aliasedTableColumn(field, tableAlias),
						)
					),
				);
				const builtRelation = this.buildRelationalQuery({
					fullSchema,
					schema,
					tableNamesMap,
					table: fullSchema[relationTableTsName] as FirebirdTable,
					tableConfig: schema[relationTableTsName]!,
					queryConfig: is(relation, One)
						? selectedRelationConfigValue === true
							? { limit: 1 }
							: { ...selectedRelationConfigValue, limit: 1 }
						: selectedRelationConfigValue,
					tableAlias: relationTableAlias,
					joinOn,
					nestedQueryRelation: relation,
				});
				const field = sql`(${builtRelation.sql})`.as(selectedRelationTsKey);
				selection.push({
					dbKey: selectedRelationTsKey,
					tsKey: selectedRelationTsKey,
					field,
					relationTableTsKey: relationTableTsName,
					isJson: true,
					selection: builtRelation.selection,
				});
			}
		}

		if (selection.length === 0) {
			throw new DrizzleError({
				message:
					`No fields selected for table "${tableConfig.tsName}" ("${tableAlias}"). You need to have at least one item in "columns", "with" or "extras". If you need to select all columns, omit the "columns" key or set it to undefined.`,
			});
		}

		let result;

		where = and(joinOn, where);

		if (nestedQueryRelation) {
			let field = sql`'[' || ${
				sql.join(
					selection.map(({ field, isJson }) => this.buildJsonValue(field, isJson)),
					sql` || ',' || `,
				)
			} || ']'`;
			if (is(nestedQueryRelation, Many)) {
				field = sql`cast(coalesce('[' || list(${field}, ',') || ']', '[]') as varchar(8191))`;
			} else {
				field = sql`cast(${field} as varchar(8191))`;
			}
			const nestedSelection = [
				{
					dbKey: 'data',
					tsKey: 'data',
					field: field.as('data'),
					isJson: true,
					relationTableTsKey: tableConfig.tsName,
					selection,
				},
			];

			const needsSubquery = limit !== undefined || offset !== undefined || orderBy.length > 0;

			if (needsSubquery) {
				result = this.buildSelectQuery({
					table: aliasedTable(table, tableAlias),
					fields: {},
					fieldsFlat: [
						{
							path: [],
							field: sql.raw('*'),
						},
					],
					where,
					limit,
					offset,
					orderBy,
					setOperators: [],
				});

				where = undefined;
				limit = undefined;
				offset = undefined;
				orderBy = undefined;
			} else {
				result = aliasedTable(table, tableAlias);
			}

			result = this.buildSelectQuery({
				table: is(result, FirebirdTable)
					? result
					: new Subquery(result, {}, tableAlias),
				fields: {},
				fieldsFlat: nestedSelection.map(({ field }) => ({
					path: [],
					field: is(field, Column)
						? aliasedTableColumn(field, tableAlias)
						: field,
				})),
				joins,
				where,
				limit,
				offset,
				orderBy,
				setOperators: [],
			});
		} else {
			result = this.buildSelectQuery({
				table: aliasedTable(table, tableAlias),
				fields: {},
				fieldsFlat: selection.map(({ field }) => ({
					path: [],
					field: is(field, Column)
						? aliasedTableColumn(field, tableAlias)
						: field,
				})),
				joins,
				where,
				limit,
				offset,
				orderBy,
				setOperators: [],
			});
		}

		return {
			tableTsKey: tableConfig.tsName,
			sql: result,
			selection,
		};
	}
}

export class FirebirdSyncDialect extends FirebirdDialect {
	static override readonly [entityKind]: string = 'FirebirdSyncDialect';

	migrate(
		migrations: MigrationMeta[],
		session: FirebirdSession<
			'sync',
			unknown,
			Record<string, unknown>,
			TablesRelationalConfig
		>,
		config?: string | MigrationConfig,
	): void {
		const migrationsTable = config === undefined
			? '__drizzle_migrations'
			: typeof config === 'string'
			? '__drizzle_migrations'
			: (config.migrationsTable ?? '__drizzle_migrations');

		const migrationTableCreate = sql`
			CREATE TABLE ${sql.identifier(migrationsTable)} (
				id integer generated by default as identity primary key,
				hash varchar(255) NOT NULL,
				created_at bigint
			)
		`;
		const migrationTableExists = session.values<[number]>(
			sql`SELECT 1 FROM RDB$RELATIONS WHERE TRIM(RDB$RELATION_NAME) = ${migrationsTable} FETCH FIRST 1 ROW ONLY`,
		);
		if (migrationTableExists.length === 0) {
			session.run(migrationTableCreate);
		}

		const dbMigrations = session.values<[number, string, string]>(
			sql`SELECT id, hash, created_at FROM ${
				sql.identifier(migrationsTable)
			} ORDER BY created_at DESC FETCH FIRST 1 ROW ONLY`,
		);

		const lastDbMigration = dbMigrations[0] ?? undefined;

		for (const migration of migrations) {
			if (
				!lastDbMigration
				|| Number(lastDbMigration[2])! < migration.folderMillis
			) {
				for (const stmt of migration.sql) {
					const query = stmt.trim().replace(/;$/, '');
					if (query.length === 0) continue;
					session.run(sql.raw(query));
				}
				session.run(
					sql`INSERT INTO ${
						sql.identifier(
							migrationsTable,
						)
					} (hash, created_at) VALUES(${migration.hash}, ${migration.folderMillis})`,
				);
			}
		}
	}
}

export class FirebirdAsyncDialect extends FirebirdDialect {
	static override readonly [entityKind]: string = 'FirebirdAsyncDialect';

	async migrate(
		migrations: MigrationMeta[],
		session: FirebirdSession<'async', any, any, any>,
		config?: string | MigrationConfig,
	): Promise<void> {
		const migrationsTable = config === undefined
			? '__drizzle_migrations'
			: typeof config === 'string'
			? '__drizzle_migrations'
			: (config.migrationsTable ?? '__drizzle_migrations');

		const migrationTableCreate = sql`
			CREATE TABLE ${sql.identifier(migrationsTable)} (
				id integer generated by default as identity primary key,
				hash varchar(255) NOT NULL,
				created_at bigint
			)
		`;
		const migrationTableExists = await session.values<[number]>(
			sql`SELECT 1 FROM RDB$RELATIONS WHERE TRIM(RDB$RELATION_NAME) = ${migrationsTable} FETCH FIRST 1 ROW ONLY`,
		);
		if (migrationTableExists.length === 0) {
			await session.run(migrationTableCreate);
		}

		const dbMigrations = await session.values<[number, string, string]>(
			sql`SELECT id, hash, created_at FROM ${
				sql.identifier(migrationsTable)
			} ORDER BY created_at DESC FETCH FIRST 1 ROW ONLY`,
		);

		const lastDbMigration = dbMigrations[0] ?? undefined;

		for (const migration of migrations) {
			if (
				!lastDbMigration
				|| Number(lastDbMigration[2])! < migration.folderMillis
			) {
				for (const stmt of migration.sql) {
					const query = stmt.trim().replace(/;$/, '');
					if (query.length === 0) continue;
					await session.run(sql.raw(query));
				}
				await session.run(
					sql`INSERT INTO ${
						sql.identifier(
							migrationsTable,
						)
					} (hash, created_at) VALUES(${migration.hash}, ${migration.folderMillis})`,
				);
			}
		}
	}
}
