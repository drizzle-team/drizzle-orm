import { aliasedTable, getOriginalColumnFromAlias } from '~/alias.ts';
import type { AnyColumn } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import {
	type AnyOne,
	// AggregatedField,
	type BuildRelationalQueryResult,
	type ColumnWithTSName,
	type DBQueryConfig,
	getTableAsAliasSQL,
	makeDefaultRqbMapper,
	makeJitRqbMapper,
	One,
	type Relation,
	type RelationalRowsMapperGenerator,
	relationExtrasToSQL,
	relationsFilterToSQL,
	relationsOrderToSQL,
	relationToSQL,
	type TableRelationalConfig,
	type TablesRelationalConfig,
	type WithContainer,
} from '~/relations.ts';
import type { Name, Placeholder, SQLWrapper } from '~/sql/index.ts';
import { and, isSQLWrapper } from '~/sql/index.ts';
import { Param, type Query, SQL, sql, type SQLChunk, View } from '~/sql/sql.ts';
import { SQLiteColumn, type SQLiteCustomColumn } from '~/sqlite-core/columns/index.ts';
import type {
	AnySQLiteSelectQueryBuilder,
	SQLiteDeleteConfig,
	SQLiteInsertConfig,
	SQLiteUpdateConfig,
} from '~/sqlite-core/query-builders/index.ts';
import { SQLiteTable } from '~/sqlite-core/table.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, Table, TableColumns } from '~/table.ts';
import {
	makeDefaultQueryMapper,
	makeJitQueryMapper,
	orderSelectedFields,
	type RowsMapperGenerator,
	type UpdateSet,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type {
	SelectedFieldsOrdered,
	SQLiteSelectConfig,
	SQLiteSelectJoinConfig,
} from './query-builders/select.types.ts';
import { SQLiteViewBase } from './view-base.ts';
import type { SQLiteView } from './view.ts';

// Will add codecs here, do not remove
export interface SQLiteDialectConfig {
	useJitMappers?: boolean;
}

export class SQLiteDialect {
	static readonly [entityKind]: string = 'SQLiteDialect';

	readonly mapperGenerators: {
		rows: RowsMapperGenerator;
		relationalRows: RelationalRowsMapperGenerator;
	};

	constructor(config?: SQLiteDialectConfig) {
		this.mapperGenerators = config?.useJitMappers
			? {
				rows: makeJitQueryMapper,
				relationalRows: makeJitRqbMapper,
			}
			: {
				rows: makeDefaultQueryMapper,
				relationalRows: makeDefaultRqbMapper,
			};
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
	}: SQLiteDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const limitSql = this.buildLimit(limit);

		return sql`${withSql}delete from ${table}${whereSql}${returningSql}${orderBySql}${limitSql}`;
	}

	buildUpdateSet(table: SQLiteTable, set: UpdateSet): SQL {
		const tableColumns = table[Table.Symbol.Columns];

		const columnNames = Object.keys(tableColumns).filter(
			(colName) =>
				set[colName] !== undefined
				|| tableColumns[colName]?.onUpdateFn !== undefined,
		);

		const setLength = columnNames.length;
		return sql.join(
			columnNames.flatMap((colName, i) => {
				const col = tableColumns[colName]!;

				const onUpdateFnResult = col.onUpdateFn?.();
				const value = set[colName]
					?? (is(onUpdateFnResult, SQL)
						? onUpdateFnResult
						: sql.param(onUpdateFnResult, col));
				const res = sql`${sql.identifier(col.name)} = ${value}`;

				if (i < setLength - 1) {
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
	}: SQLiteUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const setSql = this.buildUpdateSet(table, set);

		const fromSql = from && sql.join([sql.raw(' from '), this.buildFromTable(from)]);

		const joinsSql = this.buildJoins(joins);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const limitSql = this.buildLimit(limit);

		return sql`${withSql}update ${table} set ${setSql}${fromSql}${joinsSql}${whereSql}${returningSql}${orderBySql}${limitSql}`;
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
		{ isSingleTable = false }: { isSingleTable?: boolean } = {},
	): SQL {
		const columnsLen = fields.length;

		const chunks = fields.flatMap(({ field }, i) => {
			const chunk: SQLChunk[] = [];

			if (is(field, SQL.Aliased)) {
				if (field.isSelectionField) {
					if (!isSingleTable && field.origin !== undefined) {
						chunk.push(sql.identifier(field.origin), sql.raw('.'));
					}
					chunk.push(sql.identifier(field.fieldAlias));
				} else {
					const query = field.sql;

					if (isSingleTable) {
						const newSql = new SQL(
							query.queryChunks.map((c) => {
								if (is(c, Column)) {
									return sql.identifier(c.name);
								}
								return c;
							}),
						);

						chunk.push(query.shouldInlineParams ? newSql.inlineParams() : newSql);
					} else {
						chunk.push(query);
					}

					chunk.push(sql` as ${sql.identifier(field.fieldAlias)}`);
				}
			} else if (is(field, SQL)) {
				const query = field;

				if (isSingleTable) {
					const newSql = new SQL(
						query.queryChunks.map((c) => {
							if (is(c, Column)) {
								return sql.identifier(c.name);
							}
							return c;
						}),
					);

					chunk.push(query.shouldInlineParams ? newSql.inlineParams() : newSql);
				} else {
					chunk.push(query);
				}
			} else if (is(field, Column)) {
				// TODO: remove after implementing codecs
				if (field.columnType === 'SQLiteNumericBigInt' || field.columnType === 'SQLiteNumeric') {
					if (isSingleTable) {
						chunk.push(
							field.isAlias
								? sql`cast(${sql.identifier(getOriginalColumnFromAlias(field).name)} as text) as ${field}`
								: sql`cast(${sql.identifier(field.name)} as text)`,
						);
					} else {
						chunk.push(
							field.isAlias
								? sql`cast(${getOriginalColumnFromAlias(field)} as text) as ${field}`
								: sql`cast(${field} as text)`,
						);
					}
				} else {
					if (isSingleTable) {
						chunk.push(
							field.isAlias
								? sql`${sql.identifier(getOriginalColumnFromAlias(field).name)} as ${field}`
								: sql.identifier(field.name),
						);
					} else {
						chunk.push(
							field.isAlias
								? sql`${getOriginalColumnFromAlias(field)} as ${field}`
								: field,
						);
					}
				}
			} else if (is(field, Subquery)) {
				if (!field._.isWith) {
					chunk.push(sql`(${field._.sql}) ${sql.identifier(field._.alias)}`);
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

	private buildJoins(
		joins: SQLiteSelectJoinConfig[] | undefined,
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

				if (is(table, SQLiteTable)) {
					const tableName = table[SQLiteTable.Symbol.Name];
					const tableSchema = table[SQLiteTable.Symbol.Schema];
					const origTableName = table[SQLiteTable.Symbol.OriginalName];
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

	private buildLimit(limit: number | Placeholder | undefined): SQL | undefined {
		return typeof limit === 'object'
				|| (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;
	}

	private buildOrderBy(
		orderBy: (SQLiteColumn | SQL | SQL.Aliased)[] | undefined,
	): SQL | undefined {
		const orderByList: (SQLiteColumn | SQL | SQL.Aliased)[] = [];

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
		table: SQL | Subquery | SQLiteViewBase | SQLiteTable | undefined,
	): SQL | Subquery | SQLiteViewBase | SQLiteTable | undefined {
		if (is(table, Table) && table[Table.Symbol.IsAlias]) {
			return sql`${sql`${sql.identifier(table[Table.Symbol.Schema] ?? '')}.`.if(table[Table.Symbol.Schema])}${
				sql.identifier(
					table[Table.Symbol.OriginalName],
				)
			} ${sql.identifier(table[Table.Symbol.Name])}`;
		}

		if (is(table, View) && table[ViewBaseConfig].isAlias) {
			let fullName = sql`${sql.identifier(table[ViewBaseConfig].originalName)}`;
			if (table[ViewBaseConfig].schema) {
				fullName = sql`${sql.identifier(table[ViewBaseConfig].schema)}.${fullName}`;
			}
			return sql`${fullName} ${sql.identifier(table[ViewBaseConfig].name)}`;
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
	}: SQLiteSelectConfig): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<SQLiteColumn>(fields);
		for (const f of fieldsList) {
			if (
				is(f.field, Column)
				&& getTableName(f.field.table)
					!== (is(table, Subquery)
						? table._.alias
						: is(table, SQLiteViewBase)
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

		const limitSql = this.buildLimit(limit);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		const finalQuery =
			sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}`;

		if (setOperators.length > 0) {
			return this.buildSetOperations(finalQuery, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		setOperators: SQLiteSelectConfig['setOperators'],
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
		setOperator: SQLiteSelectConfig['setOperators'][number];
	}): SQL {
		// SQLite doesn't support parenthesis in set operations
		const leftChunk = sql`${leftSelect.getSQL()} `;
		const rightChunk = sql`${rightSelect.getSQL()}`;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: (SQL<unknown> | Name)[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid Sql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const singleOrderBy of orderBy) {
				if (is(singleOrderBy, SQLiteColumn)) {
					orderByValues.push(sql.identifier(singleOrderBy.name));
				} else if (is(singleOrderBy, SQL)) {
					for (let i = 0; i < singleOrderBy.queryChunks.length; i++) {
						const chunk = singleOrderBy.queryChunks[i];

						if (is(chunk, SQLiteColumn)) {
							singleOrderBy.queryChunks[i] = sql.identifier(chunk.name);
						}
					}

					orderByValues.push(sql`${singleOrderBy}`);
				} else {
					orderByValues.push(sql`${singleOrderBy}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)}`;
		}

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const operatorChunk = sql.raw(`${type} ${isAll ? 'all ' : ''}`);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery({
		table,
		values: valuesOrSelect,
		onConflict,
		returning,
		withList,
		select,
	}: SQLiteInsertConfig): SQL {
		// const isSingleValue = values.length === 1;
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, SQLiteColumn> = table[Table.Symbol.Columns];

		const colEntries: [string, SQLiteColumn][] = Object.entries(columns);
		const colEntriesFiltered: [string, SQLiteColumn][] = select && !is(valuesOrSelect, SQL)
			? Object
				.keys((valuesOrSelect as TypedQueryBuilder<any>).getSelectedFields())
				.map((key) => [key, columns[key]] as [string, SQLiteColumn])
			: colEntries.filter(([_, col]) => !col.shouldDisableInsert());

		const insertOrder = colEntriesFiltered.map(([, column]) => sql.identifier(column.name));

		if (select) {
			const select = valuesOrSelect as AnySQLiteSelectQueryBuilder | SQL;

			if (is(select, SQL)) {
				valuesSqlList.push(select);
			} else {
				valuesSqlList.push(select.getSQL());
			}
		} else {
			const values = valuesOrSelect as Record<string, Param | SQL>[];
			valuesSqlList.push(sql.raw('values '));

			for (const [valueIndex, value] of values.entries()) {
				const valueList: (SQLChunk | SQL)[] = [];
				for (const [fieldName, col] of colEntriesFiltered) {
					const colValue = value[fieldName];
					if (
						colValue === undefined
						|| (is(colValue, Param) && colValue.value === undefined)
					) {
						let defaultValue;
						if (col.default !== null && col.default !== undefined) {
							defaultValue = is(col.default, SQL)
								? col.default
								: sql.param(col.default, col);
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (col.defaultFn !== undefined) {
							const defaultFnResult = col.defaultFn();
							defaultValue = is(defaultFnResult, SQL)
								? defaultFnResult
								: sql.param(defaultFnResult, col);
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (!col.default && col.onUpdateFn !== undefined) {
							const onUpdateFnResult = col.onUpdateFn();
							defaultValue = is(onUpdateFnResult, SQL)
								? onUpdateFnResult
								: sql.param(onUpdateFnResult, col);
						} else {
							defaultValue = sql`null`;
						}
						valueList.push(defaultValue);
					} else {
						valueList.push(colValue);
					}
				}
				valuesSqlList.push(valueList);
				if (valueIndex < values.length - 1) {
					valuesSqlList.push(sql`, `);
				}
			}
		}

		const withSql = this.buildWithCTE(withList);

		const valuesSql = sql.join(valuesSqlList);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const onConflictSql = onConflict?.length ? sql.join(onConflict) : undefined;

		// if (isSingleValue && valuesSqlList.length === 0){
		// 	return sql`insert into ${table} default values ${onConflictSql}${returningSql}`;
		// }

		return sql`${withSql}insert into ${table} ${insertOrder} ${valuesSql}${onConflictSql}${returningSql}`;
	}

	sqlToQuery(sql: SQL, invokeSource?: 'indexes' | undefined): Query {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			invokeSource,
		});
	}

	private nestedSelectionerror() {
		throw new DrizzleError({
			message: `Views with nested selections are not supported by the relational query builder`,
		});
	}

	private buildRqbColumn(table: Table | View, column: unknown, key: string, inJson: boolean) {
		if (is(column, Column)) {
			const name = sql`${table}.${sql.identifier(column.name)}`;

			switch (column.columnType) {
				case 'SQLiteBigInt':
				case 'SQLiteBlobJson':
				case 'SQLiteBlobBuffer': {
					if (!inJson) return sql`${name} as ${sql.identifier(key)}`;
					return sql`hex(${name}) as ${sql.identifier(key)}`;
				}

				case 'SQLiteNumeric':
				case 'SQLiteNumericNumber':
				case 'SQLiteNumericBigInt': {
					// Special case - needs casting in root of query as well for drivers chop it down to number by default
					// TODO: handle with codecs
					return sql`cast(${name} as text) as ${sql.identifier(key)}`;
				}

				case 'SQLiteCustomColumn': {
					if (!inJson) return sql`${name} as ${sql.identifier(key)}`;
					return sql`${(<SQLiteCustomColumn<any>> column).jsonSelectIdentifier(name, sql)} as ${sql.identifier(key)}`;
				}

				default: {
					return sql`${name} as ${sql.identifier(key)}`;
				}
			}
		}

		return sql`${table}.${
			is(column, SQL.Aliased)
				? sql.identifier(column.fieldAlias)
				: isSQLWrapper(column)
				? sql.identifier(key)
				: this.nestedSelectionerror()
		} as ${sql.identifier(key)}`;
	}

	private unwrapAllColumns = (
		table: Table | View,
		selection: BuildRelationalQueryResult['selection'],
		inJson: boolean,
	) => {
		return sql.join(
			Object.entries(table[TableColumns]).map(([k, v]) => {
				selection.push({
					key: k,
					field: v as Column | SQL | SQLWrapper | SQL.Aliased,
				});

				return this.buildRqbColumn(table, v, k, inJson);
			}),
			sql`, `,
		);
	};

	private getSelectedTableColumns = (
		table: Table | View,
		columns: Record<string, boolean | undefined>,
	) => {
		const selectedColumns: ColumnWithTSName[] = [];
		const columnContainer = table[TableColumns];
		const entries = Object.entries(columns);

		let colSelectionMode: boolean | undefined;
		for (const [k, v] of entries) {
			if (v === undefined) continue;
			colSelectionMode = colSelectionMode || v;

			if (v) {
				const column = columnContainer[k]!;

				selectedColumns.push({
					column: column as Column | SQL | SQLWrapper | SQL.Aliased,
					tsName: k,
				});
			}
		}

		if (colSelectionMode === false) {
			for (const [k, v] of Object.entries(columnContainer)) {
				if (columns[k] === false) continue;

				selectedColumns.push({
					column: v as Column | SQL | SQLWrapper | SQL.Aliased | Table,
					tsName: k,
				});
			}
		}

		return selectedColumns;
	};

	private buildColumns = (
		table: SQLiteTable | SQLiteView,
		selection: BuildRelationalQueryResult['selection'],
		inJson: boolean,
		params?: DBQueryConfig<'many'>,
	) =>
		params?.columns
			? (() => {
				const columnIdentifiers: SQL[] = [];

				const selectedColumns = this.getSelectedTableColumns(
					table,
					params?.columns,
				);

				for (const { column, tsName } of selectedColumns) {
					columnIdentifiers.push(this.buildRqbColumn(table, column, tsName, inJson));
					selection.push({
						key: tsName,
						field: column,
					});
				}

				return columnIdentifiers.length
					? sql.join(columnIdentifiers, sql`, `)
					: undefined;
			})()
			: this.unwrapAllColumns(table, selection, inJson);

	buildRelationalQuery({
		schema,
		table,
		tableConfig,
		queryConfig: config,
		relationWhere,
		mode,
		isNested,
		errorPath,
		depth,
		throughJoin,
		jsonb,
	}: {
		schema: TablesRelationalConfig;
		table: SQLiteTable | SQLiteView;
		tableConfig: TableRelationalConfig;
		queryConfig?: DBQueryConfig<'many'> | true;
		relationWhere?: SQL;
		mode: 'first' | 'many';
		isNested?: boolean;
		errorPath?: string;
		depth?: number;
		throughJoin?: SQL;
		jsonb: SQL;
	}): BuildRelationalQueryResult {
		const selection: BuildRelationalQueryResult['selection'] = [];
		const isSingle = mode === 'first';
		const params = config === true ? undefined : config;
		const currentPath = errorPath ?? '';
		const currentDepth = depth ?? 0;
		if (!currentDepth) table = aliasedTable(table, `d${currentDepth}`);

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

		const columns = this.buildColumns(table, selection, !!isNested, params);

		const where: SQL | undefined = params?.where && relationWhere
			? and(
				relationsFilterToSQL(
					table,
					params.where,
					tableConfig.relations,
					schema,
				),
				relationWhere,
			)
			: params?.where
			? relationsFilterToSQL(
				table,
				params.where,
				tableConfig.relations,
				schema,
			)
			: relationWhere;
		const order = params?.orderBy
			? relationsOrderToSQL(table, params.orderBy)
			: undefined;
		const extras = params?.extras
			? relationExtrasToSQL(table, params.extras)
			: undefined;
		if (extras) selection.push(...extras.selection);

		const joins = params
			? (() => {
				const { with: joins } = params as WithContainer;
				if (!joins) return;

				const withEntries = Object.entries(joins).filter(([_, v]) => v);
				if (!withEntries.length) return;

				return sql.join(
					withEntries.map(([k, join]) => {
						// if (is(tableConfig.relations[k]!, AggregatedField)) {
						// 	const relation = tableConfig.relations[k]!;

						// 	relation.onTable(table);
						// 	const query = relation.getSQL();

						// 	selection.push({
						// 		key: k,
						// 		field: relation,
						// 	});

						// 	return sql`(${query}) as ${sql.identifier(k)}`;
						// }

						const relation = tableConfig.relations[k]! as Relation;
						const isSingle = is(relation, One);
						const targetTable = aliasedTable(
							relation.targetTable,
							`d${currentDepth + 1}`,
						);
						const throughTable = relation.throughTable
							? aliasedTable(relation.throughTable, `tr${currentDepth}`)
							: undefined;
						const { filter, joinCondition } = relationToSQL(
							relation,
							table,
							targetTable,
							throughTable,
						);

						const throughJoin = throughTable
							? sql` inner join ${getTableAsAliasSQL(throughTable)} on ${joinCondition!}`
							: undefined;

						const innerQuery = this.buildRelationalQuery({
							table: targetTable as SQLiteTable | SQLiteView,
							mode: isSingle ? 'first' : 'many',
							schema,
							queryConfig: join as DBQueryConfig,
							tableConfig: schema[relation.targetTableName]!,
							relationWhere: filter,
							isNested: true,
							errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
							depth: currentDepth + 1,
							throughJoin,
							jsonb,
						});

						selection.push({
							field: targetTable,
							key: k,
							selection: innerQuery.selection,
							isArray: !isSingle,
							isOptional: ((relation as AnyOne).optional ?? false)
								|| (join !== true
									&& !!(join as Exclude<typeof join, boolean | undefined>)
										.where),
						});

						const jsonColumns = sql.join(
							innerQuery.selection.map((s) => {
								return sql`${sql.raw(this.escapeString(s.key))}, ${
									s.selection
										? sql`${jsonb}(${sql.identifier(s.key)})`
										: sql.identifier(s.key)
								}`;
							}),
							sql`, `,
						);

						const json = isNested ? jsonb : sql`json`;

						const joinQuery = isSingle
							? sql`(select ${json}_object(${jsonColumns}) as ${sql.identifier('r')} from (${innerQuery.sql}) as ${
								sql.identifier(
									't',
								)
							}) as ${sql.identifier(k)}`
							: sql`coalesce((select ${json}_group_array(json_object(${jsonColumns})) as ${
								sql.identifier(
									'r',
								)
							} from (${innerQuery.sql}) as ${sql.identifier('t')}), ${jsonb}_array()) as ${sql.identifier(k)}`;

						return joinQuery;
					}),
					sql`, `,
				);
			})()
			: undefined;

		const selectionArr = [columns, extras?.sql, joins].filter(
			(e) => e !== undefined,
		);
		if (!selectionArr.length) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}
		const selectionSet = sql.join(selectionArr, sql`, `);

		const query = sql`select ${selectionSet} from ${getTableAsAliasSQL(table)}${throughJoin}${
			sql` where ${where}`.if(
				where,
			)
		}${sql` order by ${order}`.if(order)}${sql` limit ${limit}`.if(limit !== undefined)}${
			sql` offset ${offset}`.if(
				offset !== undefined,
			)
		}`;

		return {
			sql: query,
			selection,
		};
	}
}
