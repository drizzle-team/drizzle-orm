import * as V1 from '~/_relations.ts';
import { aliasedTable, aliasedTableColumn, mapColumnsInAliasedSQLToAlias, mapColumnsInSQLToAlias } from '~/alias.ts';
import { CasingCache } from '~/casing.ts';
import type { AnyColumn } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import {
	// AggregatedField,
	type AnyRelations,
	type BuildRelationalQueryResult,
	type ColumnWithTSName,
	type DBQueryConfig,
	getTableAsAliasSQL,
	One,
	type Relation,
	relationExtrasToSQL,
	relationsFilterToSQL,
	relationsOrderToSQL,
	relationToSQL,
	type TableRelationalConfig,
	type TablesRelationalConfig,
	type WithContainer,
} from '~/relations.ts';
import type { Name, Placeholder, SQLWrapper, View } from '~/sql/index.ts';
import { and, eq, isSQLWrapper } from '~/sql/index.ts';
import { Param, type QueryWithTypings, SQL, sql, type SQLChunk } from '~/sql/sql.ts';
import { SQLiteColumn } from '~/sqlite-core/columns/index.ts';
import type {
	AnySQLiteSelectQueryBuilder,
	SQLiteDeleteConfig,
	SQLiteInsertConfig,
	SQLiteUpdateConfig,
} from '~/sqlite-core/query-builders/index.ts';
import { SQLiteTable } from '~/sqlite-core/table.ts';
import { Subquery } from '~/subquery.ts';
import { Columns, getTableName, getTableUniqueName, Table } from '~/table.ts';
import { type Casing, orderSelectedFields, type UpdateSet } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type {
	SelectedFieldsOrdered,
	SQLiteSelectConfig,
	SQLiteSelectJoinConfig,
} from './query-builders/select.types.ts';
import type { SQLiteSession } from './session.ts';
import { SQLiteViewBase } from './view-base.ts';
import type { SQLiteView } from './view.ts';

export interface SQLiteDialectConfig {
	casing?: Casing;
}

export abstract class SQLiteDialect {
	static readonly [entityKind]: string = 'SQLiteDialect';

	/** @internal */
	readonly casing: CasingCache;

	constructor(config?: SQLiteDialectConfig) {
		this.casing = new CasingCache(config?.casing);
	}

	escapeName(name: string): string {
		return `"${name}"`;
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

	buildDeleteQuery({ table, where, returning, withList, limit, orderBy }: SQLiteDeleteConfig): SQL {
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

		const columnNames = Object.keys(tableColumns).filter((colName) =>
			set[colName] !== undefined || tableColumns[colName]?.onUpdateFn !== undefined
		);

		const setSize = columnNames.length;
		return sql.join(columnNames.flatMap((colName, i) => {
			const col = tableColumns[colName]!;

			const value = set[colName] ?? sql.param(col.onUpdateFn!(), col);
			const res = sql`${sql.identifier(this.casing.getColumnCasing(col))} = ${value}`;

			if (i < setSize - 1) {
				return [res, sql.raw(', ')];
			}
			return [res];
		}));
	}

	buildUpdateQuery({ table, set, where, returning, withList, joins, from, limit, orderBy }: SQLiteUpdateConfig): SQL {
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

		const chunks = fields
			.flatMap(({ field }, i) => {
				const chunk: SQLChunk[] = [];

				if (is(field, SQL.Aliased) && field.isSelectionField) {
					chunk.push(sql.identifier(field.fieldAlias));
				} else if (is(field, SQL.Aliased) || is(field, SQL)) {
					const query = is(field, SQL.Aliased) ? field.sql : field;

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
				} else if (is(field, Column)) {
					const tableName = field.table[Table.Symbol.Name];
					if (field.columnType === 'SQLiteNumericBigInt') {
						if (isSingleTable) {
							chunk.push(sql`cast(${sql.identifier(this.casing.getColumnCasing(field))} as text)`);
						} else {
							chunk.push(
								sql`cast(${sql.identifier(tableName)}.${sql.identifier(this.casing.getColumnCasing(field))} as text)`,
							);
						}
					} else {
						if (isSingleTable) {
							chunk.push(sql.identifier(this.casing.getColumnCasing(field)));
						} else {
							chunk.push(sql`${sql.identifier(tableName)}.${sql.identifier(this.casing.getColumnCasing(field))}`);
						}
					}
				}

				if (i < columnsLen - 1) {
					chunk.push(sql`, `);
				}

				return chunk;
			});

		return sql.join(chunks);
	}

	private buildJoins(joins: SQLiteSelectJoinConfig[] | undefined): SQL | undefined {
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

				if (is(table, SQLiteTable)) {
					const tableName = table[SQLiteTable.Symbol.Name];
					const tableSchema = table[SQLiteTable.Symbol.Schema];
					const origTableName = table[SQLiteTable.Symbol.OriginalName];
					const alias = tableName === origTableName ? undefined : joinMeta.alias;
					joinsArray.push(
						sql`${sql.raw(joinMeta.joinType)} join ${tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined}${
							sql.identifier(origTableName)
						}${alias && sql` ${sql.identifier(alias)}`} on ${joinMeta.on}`,
					);
				} else {
					joinsArray.push(
						sql`${sql.raw(joinMeta.joinType)} join ${table} on ${joinMeta.on}`,
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
		return typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;
	}

	private buildOrderBy(orderBy: (SQLiteColumn | SQL | SQL.Aliased)[] | undefined): SQL | undefined {
		const orderByList: (SQLiteColumn | SQL | SQL.Aliased)[] = [];

		if (orderBy) {
			for (const [index, orderByValue] of orderBy.entries()) {
				orderByList.push(orderByValue);

				if (index < orderBy.length - 1) {
					orderByList.push(sql`, `);
				}
			}
		}

		return orderByList.length > 0 ? sql` order by ${sql.join(orderByList)}` : undefined;
	}

	private buildFromTable(
		table: SQL | Subquery | SQLiteViewBase | SQLiteTable | undefined,
	): SQL | Subquery | SQLiteViewBase | SQLiteTable | undefined {
		if (is(table, Table) && table[Table.Symbol.IsAlias]) {
			return sql`${sql`${sql.identifier(table[Table.Symbol.Schema] ?? '')}.`.if(table[Table.Symbol.Schema])}${
				sql.identifier(table[Table.Symbol.OriginalName])
			} ${sql.identifier(table[Table.Symbol.Name])}`;
		}

		return table;
	}

	buildSelectQuery(
		{
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
		}: SQLiteSelectConfig,
	): SQL {
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
					joins?.some(({ alias }) =>
						alias === (table[Table.Symbol.IsAlias] ? getTableName(table) : table[Table.Symbol.BaseName])
					))(f.field.table)
			) {
				const tableName = getTableName(f.field.table);
				throw new Error(
					`Your "${
						f.path.join('->')
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

		const groupBySql = groupByList.length > 0 ? sql` group by ${sql.join(groupByList)}` : undefined;

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

	buildSetOperations(leftSelect: SQL, setOperators: SQLiteSelectConfig['setOperators']): SQL {
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
	}: { leftSelect: SQL; setOperator: SQLiteSelectConfig['setOperators'][number] }): SQL {
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
							singleOrderBy.queryChunks[i] = sql.identifier(this.casing.getColumnCasing(chunk));
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

	buildInsertQuery(
		{ table, values: valuesOrSelect, onConflict, returning, withList, select }: SQLiteInsertConfig,
	): SQL {
		// const isSingleValue = values.length === 1;
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, SQLiteColumn> = table[Table.Symbol.Columns];

		const colEntries: [string, SQLiteColumn][] = Object.entries(columns).filter(([_, col]) =>
			!col.shouldDisableInsert()
		);
		const insertOrder = colEntries.map(([, column]) => sql.identifier(this.casing.getColumnCasing(column)));

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
				for (const [fieldName, col] of colEntries) {
					const colValue = value[fieldName];
					if (colValue === undefined || (is(colValue, Param) && colValue.value === undefined)) {
						let defaultValue;
						if (col.default !== null && col.default !== undefined) {
							defaultValue = is(col.default, SQL) ? col.default : sql.param(col.default, col);
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (col.defaultFn !== undefined) {
							const defaultFnResult = col.defaultFn();
							defaultValue = is(defaultFnResult, SQL) ? defaultFnResult : sql.param(defaultFnResult, col);
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (!col.default && col.onUpdateFn !== undefined) {
							const onUpdateFnResult = col.onUpdateFn();
							defaultValue = is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col);
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

		const onConflictSql = onConflict?.length
			? sql.join(onConflict)
			: undefined;

		// if (isSingleValue && valuesSqlList.length === 0){
		// 	return sql`insert into ${table} default values ${onConflictSql}${returningSql}`;
		// }

		return sql`${withSql}insert into ${table} ${insertOrder} ${valuesSql}${onConflictSql}${returningSql}`;
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

	/** @deprecated */
	_buildRelationalQuery({
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
		schema: V1.TablesRelationalConfig;
		tableNamesMap: Record<string, string>;
		table: SQLiteTable;
		tableConfig: V1.TableRelationalConfig;
		queryConfig: true | V1.DBQueryConfig<'many', true>;
		tableAlias: string;
		nestedQueryRelation?: V1.Relation;
		joinOn?: SQL;
	}): V1.BuildRelationalQueryResult<SQLiteTable, SQLiteColumn> {
		let selection: V1.BuildRelationalQueryResult<SQLiteTable, SQLiteColumn>['selection'] = [];
		let limit, offset, orderBy: SQLiteSelectConfig['orderBy'] = [], where;
		const joins: SQLiteSelectJoinConfig[] = [];

		if (config === true) {
			const selectionEntries = Object.entries(tableConfig.columns);
			selection = selectionEntries.map((
				[key, value],
			) => ({
				dbKey: value.name,
				tsKey: key,
				field: aliasedTableColumn(value as SQLiteColumn, tableAlias),
				relationTableTsKey: undefined,
				isJson: false,
				selection: [],
			}));
		} else {
			const aliasedColumns = Object.fromEntries(
				Object.entries(tableConfig.columns).map(([key, value]) => [key, aliasedTableColumn(value, tableAlias)]),
			);

			if (config.where) {
				const whereSql = typeof config.where === 'function'
					? config.where(aliasedColumns, V1.getOperators())
					: config.where;
				where = whereSql && mapColumnsInSQLToAlias(whereSql, tableAlias);
			}

			const fieldsSelection: { tsKey: string; value: SQLiteColumn | SQL.Aliased }[] = [];
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
						: Object.keys(tableConfig.columns).filter((key) => !selectedColumns.includes(key));
				}
			} else {
				// Select all columns if selection is not specified
				selectedColumns = Object.keys(tableConfig.columns);
			}

			for (const field of selectedColumns) {
				const column = tableConfig.columns[field]! as SQLiteColumn;
				fieldsSelection.push({ tsKey: field, value: column });
			}

			let selectedRelations: {
				tsKey: string;
				queryConfig: true | V1.DBQueryConfig<'many', false>;
				relation: V1.Relation;
			}[] = [];

			// Figure out which relations to select
			if (config.with) {
				selectedRelations = Object.entries(config.with)
					.filter((entry): entry is [typeof entry[0], NonNullable<typeof entry[1]>] => !!entry[1])
					.map(([tsKey, queryConfig]) => ({ tsKey, queryConfig, relation: tableConfig.relations[tsKey]! }));
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
					dbKey: is(value, SQL.Aliased) ? value.fieldAlias : tableConfig.columns[tsKey]!.name,
					tsKey,
					field: is(value, Column) ? aliasedTableColumn(value, tableAlias) : value,
					relationTableTsKey: undefined,
					isJson: false,
					selection: [],
				});
			}

			let orderByOrig = typeof config.orderBy === 'function'
				? config.orderBy(aliasedColumns, V1.getOrderByOperators())
				: config.orderBy ?? [];
			if (!Array.isArray(orderByOrig)) {
				orderByOrig = [orderByOrig];
			}
			orderBy = orderByOrig.map((orderByValue) => {
				if (is(orderByValue, Column)) {
					return aliasedTableColumn(orderByValue, tableAlias) as SQLiteColumn;
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
				const normalizedRelation = V1.normalizeRelation(schema, tableNamesMap, relation);
				const relationTableName = getTableUniqueName(relation.referencedTable);
				const relationTableTsName = tableNamesMap[relationTableName]!;
				const relationTableAlias = `${tableAlias}_${selectedRelationTsKey}`;
				// const relationTable = schema[relationTableTsName]!;
				const joinOn = and(
					...normalizedRelation.fields.map((field, i) =>
						eq(
							aliasedTableColumn(normalizedRelation.references[i]!, relationTableAlias),
							aliasedTableColumn(field, tableAlias),
						)
					),
				);
				const builtRelation = this._buildRelationalQuery({
					fullSchema,
					schema,
					tableNamesMap,
					table: fullSchema[relationTableTsName] as SQLiteTable,
					tableConfig: schema[relationTableTsName]!,
					queryConfig: is(relation, V1.One)
						? (selectedRelationConfigValue === true
							? { limit: 1 }
							: { ...selectedRelationConfigValue, limit: 1 })
						: selectedRelationConfigValue,
					tableAlias: relationTableAlias,
					joinOn,
					nestedQueryRelation: relation,
				});
				const field = (sql`(${builtRelation.sql})`).as(selectedRelationTsKey);
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
			let field = sql`json_array(${
				sql.join(
					selection.map(({ field }) =>
						is(field, SQLiteColumn)
							? sql.identifier(this.casing.getColumnCasing(field))
							: is(field, SQL.Aliased)
							? field.sql
							: field
					),
					sql`, `,
				)
			})`;
			if (is(nestedQueryRelation, V1.Many)) {
				field = sql`coalesce(json_group_array(${field}), json_array())`;
			}
			const nestedSelection = [{
				dbKey: 'data',
				tsKey: 'data',
				field: field.as('data'),
				isJson: true,
				relationTableTsKey: tableConfig.tsName,
				selection,
			}];

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
				table: is(result, SQLiteTable) ? result : new Subquery(result, {}, tableAlias),
				fields: {},
				fieldsFlat: nestedSelection.map(({ field }) => ({
					path: [],
					field: is(field, Column) ? aliasedTableColumn(field, tableAlias) : field,
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
					field: is(field, Column) ? aliasedTableColumn(field, tableAlias) : field,
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

	private nestedSelectionerror() {
		throw new DrizzleError({
			message: `Views with nested selections are not supported by the relational query builder`,
		});
	}

	private buildRqbColumn(table: Table | View, column: unknown, key: string) {
		if (is(column, Column)) {
			const name = sql`${table}.${sql.identifier(this.casing.getColumnCasing(column))}`;

			switch (column.columnType) {
				case 'SQLiteBigInt':
				case 'SQLiteBlobJson':
				case 'SQLiteBlobBuffer': {
					return sql`hex(${name}) as ${sql.identifier(key)}`;
				}

				case 'SQLiteNumeric':
				case 'SQLiteNumericNumber':
				case 'SQLiteNumericBigInt': {
					return sql`cast(${name} as text) as ${sql.identifier(key)}`;
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

	private unwrapAllColumns = (table: Table | View, selection: BuildRelationalQueryResult['selection']) => {
		return sql.join(
			Object.entries(table[Columns]).map(([k, v]) => {
				selection.push({
					key: k,
					field: v as Column | SQL | SQLWrapper | SQL.Aliased,
				});

				return this.buildRqbColumn(table, v, k);
			}),
			sql`, `,
		);
	};

	private getSelectedTableColumns = (table: Table | View, columns: Record<string, boolean | undefined>) => {
		const selectedColumns: ColumnWithTSName[] = [];
		const columnContainer = table[Columns];
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
		params?: DBQueryConfig<'many'>,
	) =>
		params?.columns
			? (() => {
				const columnIdentifiers: SQL[] = [];

				const selectedColumns = this.getSelectedTableColumns(table, params?.columns);

				for (const { column, tsName } of selectedColumns) {
					columnIdentifiers.push(this.buildRqbColumn(table, column, tsName));
					selection.push({
						key: tsName,
						field: column,
					});
				}

				return columnIdentifiers.length
					? sql.join(columnIdentifiers, sql`, `)
					: undefined;
			})()
			: this.unwrapAllColumns(table, selection);

	buildRelationalQuery(
		{
			tables,
			schema,
			tableNamesMap,
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
			tables: Record<string, SQLiteTable | SQLiteView>;
			schema: TablesRelationalConfig;
			tableNamesMap: Record<string, string>;
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
		},
	): BuildRelationalQueryResult {
		const selection: BuildRelationalQueryResult['selection'] = [];
		const isSingle = mode === 'first';
		const params = config === true ? undefined : config;
		const currentPath = errorPath ?? '';
		const currentDepth = depth ?? 0;
		if (!currentDepth) table = aliasedTable(table, `d${currentDepth}`);

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

		const columns = this.buildColumns(table, selection, params);

		const where: SQL | undefined = (params?.where && relationWhere)
			? and(
				relationsFilterToSQL(table, params.where, tableConfig.relations, schema, tableNamesMap, this.casing),
				relationWhere,
			)
			: params?.where
			? relationsFilterToSQL(table, params.where, tableConfig.relations, schema, tableNamesMap, this.casing)
			: relationWhere;
		const order = params?.orderBy ? relationsOrderToSQL(table, params.orderBy) : undefined;
		const extras = params?.extras ? relationExtrasToSQL(table, params.extras) : undefined;
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
						const targetTable = aliasedTable(relation.targetTable, `d${currentDepth + 1}`);
						const throughTable = relation.throughTable
							? aliasedTable(relation.throughTable, `tr${currentDepth}`)
							: undefined;
						const { filter, joinCondition } = relationToSQL(
							this.casing,
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
							tableConfig: schema[tableNamesMap[getTableUniqueName(relation.targetTable)]!]!,
							tableNamesMap,
							tables,
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
							isOptional: ((relation as One<any, any>).optional ?? false)
								|| (join !== true && !!(join as Exclude<typeof join, boolean | undefined>).where),
						});

						const jsonColumns = sql.join(
							innerQuery.selection.map((s) => {
								return sql`${sql.raw(this.escapeString(s.key))}, ${
									s.selection ? sql`${jsonb}(${sql.identifier(s.key)})` : sql.identifier(s.key)
								}`;
							}),
							sql`, `,
						);

						const json = isNested ? jsonb : sql`json`;

						const joinQuery = isSingle
							? sql`(select ${json}_object(${jsonColumns}) as ${sql.identifier('r')} from (${innerQuery.sql}) as ${
								sql.identifier('t')
							}) as ${sql.identifier(k)}`
							: sql`coalesce((select ${json}_group_array(json_object(${jsonColumns})) as ${
								sql.identifier('r')
							} from (${innerQuery.sql}) as ${sql.identifier('t')}), ${jsonb}_array()) as ${sql.identifier(k)}`;

						return joinQuery;
					}),
					sql`, `,
				);
			})()
			: undefined;

		const selectionArr = [columns, extras?.sql, joins].filter((e) => e !== undefined);
		if (!selectionArr.length) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.tsName}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}
		const selectionSet = sql.join(selectionArr, sql`, `);

		const query = sql`select ${selectionSet} from ${getTableAsAliasSQL(table)}${throughJoin}${
			sql` where ${where}`.if(where)
		}${sql` order by ${order}`.if(order)}${sql` limit ${limit}`.if(limit !== undefined)}${
			sql` offset ${offset}`.if(offset !== undefined)
		}`;

		return {
			sql: query,
			selection,
		};
	}
}

export class SQLiteSyncDialect extends SQLiteDialect {
	static override readonly [entityKind]: string = 'SQLiteSyncDialect';

	migrate(
		migrations: MigrationMeta[],
		session: SQLiteSession<
			'sync',
			unknown,
			Record<string, unknown>,
			AnyRelations,
			TablesRelationalConfig,
			V1.TablesRelationalConfig
		>,
		config?: string | MigrationConfig,
	): void {
		const migrationsTable = config === undefined
			? '__drizzle_migrations'
			: typeof config === 'string'
			? '__drizzle_migrations'
			: config.migrationsTable ?? '__drizzle_migrations';

		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
		session.run(migrationTableCreate);

		const dbMigrations = session.values<[number, string, string]>(
			sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`,
		);

		const lastDbMigration = dbMigrations[0] ?? undefined;
		session.run(sql`BEGIN`);

		try {
			for (const migration of migrations) {
				if (!lastDbMigration || Number(lastDbMigration[2])! < migration.folderMillis) {
					for (const stmt of migration.sql) {
						session.run(sql.raw(stmt));
					}
					session.run(
						sql`INSERT INTO ${
							sql.identifier(migrationsTable)
						} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`,
					);
				}
			}

			session.run(sql`COMMIT`);
		} catch (e) {
			session.run(sql`ROLLBACK`);
			throw e;
		}
	}
}

export class SQLiteAsyncDialect extends SQLiteDialect {
	static override readonly [entityKind]: string = 'SQLiteAsyncDialect';

	async migrate(
		migrations: MigrationMeta[],
		session: SQLiteSession<
			'async',
			unknown,
			Record<string, unknown>,
			AnyRelations,
			TablesRelationalConfig,
			V1.TablesRelationalConfig
		>,
		config?: string | MigrationConfig,
	): Promise<void> {
		const migrationsTable = config === undefined
			? '__drizzle_migrations'
			: typeof config === 'string'
			? '__drizzle_migrations'
			: config.migrationsTable ?? '__drizzle_migrations';

		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
		await session.run(migrationTableCreate);

		const dbMigrations = await session.values<[number, string, string]>(
			sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`,
		);

		const lastDbMigration = dbMigrations[0] ?? undefined;

		await session.transaction(async (tx) => {
			for (const migration of migrations) {
				if (!lastDbMigration || Number(lastDbMigration[2])! < migration.folderMillis) {
					for (const stmt of migration.sql) {
						await tx.run(sql.raw(stmt));
					}
					await tx.run(
						sql`INSERT INTO ${
							sql.identifier(migrationsTable)
						} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`,
					);
				}
			}
		});
	}
}
