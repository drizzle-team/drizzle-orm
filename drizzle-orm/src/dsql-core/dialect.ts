import { aliasedTable } from '~/alias.ts';
import { CasingCache } from '~/casing.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import {
	type AnyOne,
	type BuildRelationalQueryResult,
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
import { Param, type QueryWithTypings, SQL, sql, type SQLChunk } from '~/sql/sql.ts';
import { View } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, Table } from '~/table.ts';
import type { Casing, UpdateSet } from '~/utils.ts';
import { orderSelectedFields } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { DSQLColumn } from './columns/common.ts';
import type { DSQLDeleteConfig } from './query-builders/delete.ts';
import type { DSQLInsertConfig } from './query-builders/insert.ts';
import type { DSQLSelectConfig, DSQLSelectJoinConfig, SelectedFieldsOrdered } from './query-builders/select.types.ts';
import type { DSQLUpdateConfig } from './query-builders/update.ts';
import { DSQLTable } from './table.ts';
import { DSQLViewBase } from './view-base.ts';

export interface DSQLDialectConfig {
	casing?: Casing;
}

/**
 * Dialect for Amazon Aurora DSQL.
 *
 * Note: Migrations are not supported for DSQL. DSQL only allows one DDL statement
 * per transaction and does not support DDL and DML in the same transaction. This
 * makes it impossible to safely apply multi-statement migrations with rollback
 * capability.
 */
export class DSQLDialect {
	static readonly [entityKind]: string = 'DSQLDialect';

	/** @internal */
	readonly casing: CasingCache;

	constructor(config?: DSQLDialectConfig) {
		this.casing = new CasingCache(config?.casing);
	}

	escapeName(name: string): string {
		// PostgreSQL-style double-quote identifier escaping
		return `"${name}"`;
	}

	escapeParam(num: number): string {
		// PostgreSQL-style positional parameter (1-indexed)
		return `$${num + 1}`;
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

	/**
	 * Builds selection SQL with provided fields/expressions
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
						const newSql = new SQL(
							query.queryChunks.map((c) => {
								if (is(c, DSQLColumn)) {
									return sql.identifier(this.casing.getColumnCasing(c));
								}
								return c;
							}),
						);

						chunk.push(query.shouldInlineParams ? newSql.inlineParams() : newSql);
					} else {
						chunk.push(query);
					}

					if (is(field, SQL.Aliased)) {
						chunk.push(sql` as ${sql.identifier(field.fieldAlias)}`);
					}
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

	private buildJoins(joins: DSQLSelectJoinConfig[] | undefined): SQL | undefined {
		if (!joins || joins.length === 0) {
			return undefined;
		}

		const joinsArray: SQL[] = [];

		for (const [index, joinMeta] of joins.entries()) {
			if (index === 0) {
				joinsArray.push(sql` `);
			}
			const table = joinMeta.table;
			const lateralSql = joinMeta.lateral ? sql` lateral` : undefined;
			const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : undefined;

			if (is(table, DSQLTable)) {
				const tableName = table[DSQLTable.Symbol.Name];
				const tableSchema = table[DSQLTable.Symbol.Schema];
				const origTableName = table[DSQLTable.Symbol.OriginalName];
				const alias = tableName === origTableName ? undefined : joinMeta.alias;
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join${lateralSql} ${
						tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined
					}${sql.identifier(origTableName)}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
				);
			} else if (is(table, View)) {
				const viewName = table[ViewBaseConfig].name;
				const viewSchema = table[ViewBaseConfig].schema;
				const origViewName = table[ViewBaseConfig].originalName;
				const alias = viewName === origViewName ? undefined : joinMeta.alias;
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join${lateralSql} ${
						viewSchema ? sql`${sql.identifier(viewSchema)}.` : undefined
					}${sql.identifier(origViewName)}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
				);
			} else {
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join${lateralSql} ${table}${onSql}`,
				);
			}
			if (index < joins.length - 1) {
				joinsArray.push(sql` `);
			}
		}

		return sql.join(joinsArray);
	}

	private buildFromTable(
		table: SQL | Subquery | DSQLViewBase | DSQLTable | undefined,
	): SQL | Subquery | DSQLViewBase | DSQLTable | undefined {
		if (is(table, Table) && table[Table.Symbol.IsAlias]) {
			let fullName = sql`${sql.identifier(table[Table.Symbol.OriginalName])}`;
			if (table[Table.Symbol.Schema]) {
				fullName = sql`${sql.identifier(table[Table.Symbol.Schema]!)}.${fullName}`;
			}
			return sql`${fullName} ${sql.identifier(table[Table.Symbol.Name])}`;
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

	buildDeleteQuery({ table, where, returning, withList }: DSQLDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`${withSql}delete from ${table}${whereSql}${returningSql}`;
	}

	buildUpdateSet(table: DSQLTable, set: UpdateSet): SQL {
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

	buildUpdateQuery({ table, set, where, returning, withList, from, joins }: DSQLUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const tableName = table[DSQLTable.Symbol.Name];
		const tableSchema = table[DSQLTable.Symbol.Schema];
		const origTableName = table[DSQLTable.Symbol.OriginalName];
		const alias = tableName === origTableName ? undefined : tableName;
		const tableSql = sql`${tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined}${
			sql.identifier(origTableName)
		}${alias && sql` ${sql.identifier(alias)}`}`;

		const setSql = this.buildUpdateSet(table, set);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: !from && (!joins || joins.length === 0) })}`
			: undefined;

		const fromSql = from ? sql` from ${this.buildFromTable(from)}` : undefined;
		const joinsSql = this.buildJoins(joins);

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`${withSql}update ${tableSql} set ${setSql}${fromSql}${joinsSql}${whereSql}${returningSql}`;
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
			lockingClause,
			distinct,
			setOperators,
		}: DSQLSelectConfig,
	): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<DSQLColumn>(fields);
		for (const f of fieldsList) {
			if (
				is(f.field, Column)
				&& getTableName(f.field.table)
					!== (is(table, Subquery)
						? table._.alias
						: is(table, DSQLViewBase)
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
				throw new DrizzleError({
					message: `Your "${
						f.path.join('->')
					}" field references a column "${tableName}"."${f.field.name}", but the table "${tableName}" is not part of the query! Did you forget to join it?`,
				});
			}
		}

		const isSingleTable = !joins || joins.length === 0;

		const withSql = this.buildWithCTE(withList);

		let distinctSql: SQL | undefined;
		if (distinct) {
			distinctSql = distinct === true ? sql` distinct` : sql` distinct on (${sql.join(distinct.on, sql`, `)})`;
		}

		const selection = this.buildSelection(fieldsList, { isSingleTable });

		const tableSql = this.buildFromTable(table);

		const joinsSql = this.buildJoins(joins);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			orderBySql = sql` order by ${sql.join(orderBy, sql`, `)}`;
		}

		let groupBySql;
		if (groupBy && groupBy.length > 0) {
			groupBySql = sql` group by ${sql.join(groupBy, sql`, `)}`;
		}

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		const lockingClauseSql = sql.empty();
		if (lockingClause) {
			const clauseSql = sql` for ${sql.raw(lockingClause.strength)}`;
			if (lockingClause.config.of) {
				const tables = Array.isArray(lockingClause.config.of)
					? lockingClause.config.of
					: [lockingClause.config.of];
				clauseSql.append(sql` of ${
					sql.join(
						tables.map((t) => sql.identifier(t[DSQLTable.Symbol.Name])),
						sql`, `,
					)
				}`);
			}
			if (lockingClause.config.noWait) {
				clauseSql.append(sql` nowait`);
			} else if (lockingClause.config.skipLocked) {
				clauseSql.append(sql` skip locked`);
			}
			lockingClauseSql.append(clauseSql);
		}
		const finalQuery =
			sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}${lockingClauseSql}`;

		if (setOperators.length > 0) {
			return this.buildSetOperations(finalQuery, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(leftSelect: SQL, setOperators: DSQLSelectConfig['setOperators']): SQL {
		const [setOperator, ...rest] = setOperators;

		if (!setOperator) {
			throw new DrizzleError({ message: 'Cannot pass undefined values to any set operator' });
		}

		if (rest.length === 0) {
			return this.buildSetOperationQuery({ leftSelect, setOperator });
		}

		return this.buildSetOperations(
			this.buildSetOperationQuery({ leftSelect, setOperator }),
			rest,
		);
	}

	buildSetOperationQuery({
		leftSelect,
		setOperator: { type, isAll, rightSelect, limit, orderBy, offset },
	}: { leftSelect: SQL; setOperator: DSQLSelectConfig['setOperators'][number] }): SQL {
		const leftChunk = sql`(${leftSelect.getSQL()}) `;
		const rightChunk = sql`(${rightSelect.getSQL()})`;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: SQL[] = [];

			for (const singleOrderBy of orderBy) {
				if (is(singleOrderBy, DSQLColumn)) {
					orderByValues.push(sql`${sql.identifier(singleOrderBy.name)}`);
				} else if (is(singleOrderBy, SQL)) {
					for (let i = 0; i < singleOrderBy.queryChunks.length; i++) {
						const chunk = singleOrderBy.queryChunks[i];

						if (is(chunk, DSQLColumn)) {
							singleOrderBy.queryChunks[i] = sql.identifier(chunk.name);
						}
					}

					orderByValues.push(sql`${singleOrderBy}`);
				} else {
					orderByValues.push(sql`${singleOrderBy}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)} `;
		}

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const operatorChunk = sql.raw(`${type} ${isAll ? 'all ' : ''}`);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery(
		{ table, values: valuesOrSelect, onConflict, returning, withList, select }: DSQLInsertConfig,
	): SQL {
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, DSQLColumn> = table[Table.Symbol.Columns];

		const colEntries: [string, DSQLColumn][] = Object.entries(columns).filter(([_, col]) => !col.shouldDisableInsert());

		const insertOrder = colEntries.map(
			([, column]) => sql.identifier(this.casing.getColumnCasing(column)),
		);

		if (select) {
			const selectValue = valuesOrSelect as SQL;

			if (is(selectValue, SQL)) {
				valuesSqlList.push(selectValue);
			} else {
				valuesSqlList.push((selectValue as any).getSQL());
			}
		} else {
			const values = valuesOrSelect as Record<string, Param | SQL>[];
			valuesSqlList.push(sql.raw('values '));

			for (const [valueIndex, value] of values.entries()) {
				const valueList: (SQLChunk | SQL)[] = [];
				for (const [fieldName, col] of colEntries) {
					const colValue = value[fieldName];
					if (colValue === undefined || (is(colValue, Param) && colValue.value === undefined)) {
						if (col.defaultFn !== undefined) {
							const defaultFnResult = col.defaultFn();
							const defaultValue = is(defaultFnResult, SQL) ? defaultFnResult : sql.param(defaultFnResult, col);
							valueList.push(defaultValue);
						} else if (!col.default && col.onUpdateFn !== undefined) {
							const onUpdateFnResult = col.onUpdateFn();
							const newValue = is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col);
							valueList.push(newValue);
						} else {
							valueList.push(sql`default`);
						}
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

		const onConflictSql = onConflict ? sql` on conflict ${onConflict}` : undefined;

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

	private buildColumns(
		table: DSQLTable | DSQLViewBase,
		selection: BuildRelationalQueryResult['selection'],
		params: DBQueryConfig<'many'> | undefined,
	): SQL | undefined {
		const tableConfig = is(table, DSQLTable)
			? table[Table.Symbol.Columns]
			: table[ViewBaseConfig]?.selectedFields;
		if (!tableConfig) return undefined;

		let columns: Record<string, Column> | undefined;
		if (params?.columns) {
			let isIncludeMode = false;
			let selectedColumns: string[] = [];

			for (const [field, value] of Object.entries(params.columns)) {
				if (value === undefined) continue;
				if (field in tableConfig) {
					if (!isIncludeMode && value === true) {
						isIncludeMode = true;
					}
					selectedColumns.push(field);
				}
			}

			if (selectedColumns.length > 0) {
				selectedColumns = isIncludeMode
					? selectedColumns.filter((c) => params.columns?.[c] === true)
					: Object.keys(tableConfig).filter((key) => !selectedColumns.includes(key));

				columns = Object.fromEntries(
					selectedColumns.map((key) => [key, tableConfig[key]!]),
				) as Record<string, Column>;
			}
		}

		if (!columns) {
			columns = tableConfig as Record<string, Column>;
		}

		const columnEntries = Object.entries(columns);
		if (columnEntries.length === 0) return undefined;

		for (const [key, column] of columnEntries) {
			selection.push({
				key,
				field: column,
			});
		}

		return sql.join(
			columnEntries.map(([key, column]) => sql`${column} as ${sql.identifier(key)}`),
			sql`, `,
		);
	}

	buildRelationalQuery({
		schema,
		table,
		tableConfig,
		queryConfig: config,
		relationWhere,
		mode,
		errorPath,
		depth,
		throughJoin,
	}: {
		schema: TablesRelationalConfig;
		table: DSQLTable | DSQLViewBase;
		tableConfig: TableRelationalConfig;
		queryConfig?: DBQueryConfig<'many'> | true;
		relationWhere?: SQL;
		mode: 'first' | 'many';
		errorPath?: string;
		depth?: number;
		throughJoin?: SQL;
	}): BuildRelationalQueryResult {
		const selection: BuildRelationalQueryResult['selection'] = [];
		const isSingle = mode === 'first';
		const params = config === true ? undefined : config;
		const currentPath = errorPath ?? '';
		const currentDepth = depth ?? 0;
		if (!currentDepth) table = aliasedTable(table, `d${currentDepth}`) as DSQLTable | DSQLViewBase;

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

		const where: SQL | undefined = (params?.where && relationWhere)
			? sql`${
				relationsFilterToSQL(table, params.where, tableConfig.relations, schema, this.casing)
			} and ${relationWhere}`
			: params?.where
			? relationsFilterToSQL(table, params.where, tableConfig.relations, schema, this.casing)
			: relationWhere;

		const order = params?.orderBy ? relationsOrderToSQL(table, params.orderBy) : undefined;
		const columns = this.buildColumns(table, selection, params);
		const extras = params?.extras ? relationExtrasToSQL(table, params.extras) : undefined;
		if (extras) selection.push(...extras.selection);

		const selectionArr: SQL[] = columns ? [columns] : [];

		const joins = params
			? (() => {
				const { with: joins } = params as WithContainer;
				if (!joins) return;

				const withEntries = Object.entries(joins).filter(([_, v]) => v);
				if (!withEntries.length) return;

				return sql.join(
					withEntries.map(([k, join]) => {
						const relation = tableConfig.relations[k]! as Relation;
						const isSingle = is(relation, One);
						const targetTable = aliasedTable(relation.targetTable, `d${currentDepth + 1}`) as DSQLTable | DSQLViewBase;
						const throughTable = relation.throughTable
							? aliasedTable(relation.throughTable, `tr${currentDepth}`) as Table | View
							: undefined;
						const { filter, joinCondition } = relationToSQL(
							this.casing,
							relation,
							table,
							targetTable,
							throughTable,
						);

						selectionArr.push(sql`${sql.identifier(k)}.${sql.identifier('r')} as ${sql.identifier(k)}`);

						const innerThroughJoin = throughTable
							? sql` inner join ${getTableAsAliasSQL(throughTable)} on ${joinCondition!}`
							: undefined;

						const innerQuery = this.buildRelationalQuery({
							table: targetTable,
							mode: isSingle ? 'first' : 'many',
							schema,
							queryConfig: join as DBQueryConfig,
							tableConfig: schema[relation.targetTableName]!,
							relationWhere: filter,
							errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
							depth: currentDepth + 1,
							throughJoin: innerThroughJoin,
						});

						selection.push({
							field: targetTable,
							key: k,
							selection: innerQuery.selection,
							isArray: !isSingle,
							isOptional: ((relation as AnyOne).optional ?? false)
								|| (join !== true && !!(join as Exclude<typeof join, boolean | undefined>).where),
						});

						const joinQuery = sql`left join lateral(select ${
							isSingle
								? sql`row_to_json(${sql.identifier('t')}.*) ${sql.identifier('r')}`
								: sql`coalesce(json_agg(row_to_json(${sql.identifier('t')}.*)), '[]') as ${sql.identifier('r')}`
						} from (${innerQuery.sql}) as ${sql.identifier('t')}) as ${sql.identifier(k)} on true`;

						return joinQuery;
					}),
					sql` `,
				);
			})()
			: undefined;

		if (extras?.sql) selectionArr.push(extras.sql);
		if (!selectionArr.length) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}
		const selectionSet = sql.join(selectionArr.filter((e) => e !== undefined), sql`, `);
		const query = sql`select ${selectionSet} from ${getTableAsAliasSQL(table)}${throughJoin}${
			sql` ${joins}`.if(joins)
		}${sql` where ${where}`.if(where)}${sql` order by ${order}`.if(order)}${
			sql` limit ${limit}`.if(limit !== undefined)
		}${sql` offset ${offset}`.if(offset !== undefined)}`;

		return {
			sql: query,
			selection,
		};
	}
}
