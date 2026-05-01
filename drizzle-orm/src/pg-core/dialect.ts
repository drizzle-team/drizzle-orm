import { aliasedTable, getOriginalColumnFromAlias } from '~/alias.ts';
import { CodecsCollection } from '~/codecs.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import {
	PgColumn,
	type PgCustomColumn,
	PgDate,
	PgDateString,
	PgJson,
	PgJsonb,
	PgNumeric,
	PgTime,
	PgTimestamp,
	PgTimestampString,
	PgUUID,
} from '~/pg-core/columns/index.ts';
import type {
	AnyPgSelectQueryBuilder,
	PgDeleteConfig,
	PgInsertConfig,
	PgSelectJoinConfig,
	PgUpdateConfig,
} from '~/pg-core/query-builders/index.ts';
import type { PgSelectConfig, SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import { PgTable } from '~/pg-core/table.ts';
import {
	type AnyOne,
	// AggregatedField,
	type BuildRelationalQueryResult,
	type DBQueryConfigWithComment,
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
import { and, isSQLWrapper, type SQLWrapper, View } from '~/sql/index.ts';
import {
	type DriverValueEncoder,
	type Name,
	Param,
	type QueryTypingsValue,
	type QueryWithTypings,
	SQL,
	sql,
	type SQLChunk,
} from '~/sql/sql.ts';
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
import { type PgCodecs, type PostgresType, resolvePgTypeAlias } from './codecs.ts';
import { PgViewBase } from './view-base.ts';
import type { PgMaterializedView, PgView } from './view.ts';

export interface PgDialectConfig {
	codecs?: PgCodecs;
	useJitMappers?: boolean;
}

export class PgDialect {
	static readonly [entityKind]: string = 'PgDialect';

	readonly codecs: CodecsCollection<PostgresType>;
	readonly mapperGenerators: {
		rows: RowsMapperGenerator;
		relationalRows: RelationalRowsMapperGenerator;
	};

	constructor(config?: PgDialectConfig) {
		this.codecs = new CodecsCollection<PostgresType>(resolvePgTypeAlias, config?.codecs);
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

	escapeParam(num: number): string {
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

	buildDeleteQuery({
		table,
		where,
		returning,
		withList,
		comment,
		ignoreSelectionCastCodecs,
	}: PgDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: ignoreSelectionCastCodecs })
			}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`${withSql}delete from ${table}${whereSql}${returningSql}${
			comment !== undefined ? sql` ${comment}` : undefined
		}`;
	}

	buildUpdateSet(table: PgTable, set: UpdateSet): SQL {
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
		from,
		joins,
		comment,
		ignoreSelectionCastCodecs,
	}: PgUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const tableName = table[PgTable.Symbol.Name];
		const tableSchema = table[PgTable.Symbol.Schema];
		const origTableName = table[PgTable.Symbol.OriginalName];
		const alias = tableName === origTableName ? undefined : tableName;
		const tableSql = sql`${tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined}${
			sql.identifier(
				origTableName,
			)
		}${alias && sql` ${sql.identifier(alias)}`}`;

		const setSql = this.buildUpdateSet(table, set);

		const fromSql = from && sql.join([sql.raw(' from '), this.buildFromTable(from)]);

		const joinsSql = this.buildJoins(joins);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: !from, ignoreCastCodecs: ignoreSelectionCastCodecs })
			}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`${withSql}update ${tableSql} set ${setSql}${fromSql}${joinsSql}${whereSql}${returningSql}${
			comment !== undefined ? sql` ${comment}` : undefined
		}`;
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
		{ isSingleTable = false, ignoreCastCodecs = false }: {
			isSingleTable?: boolean;
			ignoreCastCodecs?: boolean;
		} = {},
	): SQL {
		const columnsLen = fields.length;

		const chunks = fields.flatMap(({ field }, i) => {
			const chunk: SQLChunk[] = [];

			if (is(field, SQL.Aliased) && field.isSelectionField) {
				if (!isSingleTable && field.origin !== undefined) {
					chunk.push(sql.identifier(field.origin), sql.raw('.'));
				}
				chunk.push(sql.identifier(field.fieldAlias));
			} else if (is(field, SQL.Aliased) || is(field, SQL)) {
				const query = is(field, SQL.Aliased) ? field.sql : field;

				if (isSingleTable) {
					const newSql = new SQL(
						query.queryChunks.map((c) => {
							if (is(c, PgColumn)) {
								return sql.identifier(c.name);
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
				let name: Name | Column;
				if (isSingleTable) {
					name = field.isAlias
						? sql.identifier(getOriginalColumnFromAlias(field).name)
						: sql.identifier(field.name);
				} else {
					name = field.isAlias ? getOriginalColumnFromAlias(field) : field;
				}

				const casted = ignoreCastCodecs ? name : this.codecs.apply(field, 'cast', name);
				chunk.push(field.isAlias ? sql`${casted} as ${field}` : casted);
			} else if (is(field, Subquery)) {
				const entries = Object.entries(field._.selectedFields) as [string, SQL.Aliased | Column | SQL][];

				if (entries.length === 1) {
					const entry = entries[0]![1];

					const fieldDecoder = is(entry, SQL)
						? entry.decoder
						: is(entry, Column)
						? { mapFromDriverValue: (v: any) => entry.mapFromDriverValue(v) }
						: entry.sql.decoder;

					if (fieldDecoder) {
						field._.sql.decoder = fieldDecoder;
					}
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

	private buildJoins(joins: PgSelectJoinConfig[] | undefined): SQL | undefined {
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

			if (is(table, PgTable)) {
				const tableName = table[PgTable.Symbol.Name];
				const tableSchema = table[PgTable.Symbol.Schema];
				const origTableName = table[PgTable.Symbol.OriginalName];
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
		table: SQL | Subquery | PgViewBase | PgTable | undefined,
	): SQL | Subquery | PgViewBase | PgTable | undefined {
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
		lockingClause,
		distinct,
		setOperators,
		comment,
		ignoreSelectionCastCodecs,
	}: PgSelectConfig): SQL {
		const fieldsList = fieldsFlat
			?? orderSelectedFields<PgColumn>(fields, undefined, this.codecs);
		for (const f of fieldsList) {
			if (
				is(f.field, Column)
				&& getTableName(f.field.table)
					!== (is(table, Subquery)
						? table._.alias
						: is(table, PgViewBase)
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

		let distinctSql: SQL | undefined;
		if (distinct) {
			distinctSql = distinct === true
				? sql` distinct`
				: sql` distinct on (${sql.join(distinct.on, sql`, `)})`;
		}

		const selection = this.buildSelection(fieldsList, { isSingleTable, ignoreCastCodecs: ignoreSelectionCastCodecs });

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
				clauseSql.append(
					sql` of ${
						sql.join(
							Array.isArray(lockingClause.config.of)
								? lockingClause.config.of.map((it) => sql.identifier(it[PgTable.Symbol.Name]))
								: [sql.identifier(lockingClause.config.of[PgTable.Symbol.Name])],
							sql`, `,
						)
					}`,
				);
			}
			if (lockingClause.config.noWait) {
				clauseSql.append(sql` nowait`);
			} else if (lockingClause.config.skipLocked) {
				clauseSql.append(sql` skip locked`);
			}
			lockingClauseSql.append(clauseSql);
		}
		const finalQuery =
			sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}${lockingClauseSql}${
				comment !== undefined ? sql` ${comment}` : undefined
			}`;

		if (setOperators.length > 0) {
			return this.buildSetOperations(finalQuery, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		setOperators: PgSelectConfig['setOperators'],
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
		setOperator: PgSelectConfig['setOperators'][number];
	}): SQL {
		const leftChunk = sql`(${leftSelect.getSQL()}) `;
		const rightChunk = sql`(${rightSelect.getSQL()})`;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: (SQL<unknown> | Name)[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid Sql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const singleOrderBy of orderBy) {
				if (is(singleOrderBy, PgColumn)) {
					orderByValues.push(sql.identifier(singleOrderBy.name));
				} else if (is(singleOrderBy, SQL)) {
					for (let i = 0; i < singleOrderBy.queryChunks.length; i++) {
						const chunk = singleOrderBy.queryChunks[i];

						if (is(chunk, PgColumn)) {
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

	buildInsertQuery({
		table,
		values: valuesOrSelect,
		onConflict,
		returning,
		withList,
		select,
		overridingSystemValue_,
		comment,
		ignoreSelectionCastCodecs,
	}: PgInsertConfig): SQL {
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, PgColumn> = table[Table.Symbol.Columns];

		const colEntries: [string, PgColumn][] = Object.entries(columns).filter(
			([_, col]) => !col.shouldDisableInsert(),
		);

		const insertOrder = colEntries.map(([, column]) => sql.identifier(column.name));

		if (select) {
			const select = valuesOrSelect as AnyPgSelectQueryBuilder | SQL;

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
					if (
						colValue === undefined
						|| (is(colValue, Param) && colValue.value === undefined)
					) {
						// eslint-disable-next-line unicorn/no-negated-condition
						if (col.defaultFn !== undefined) {
							const defaultFnResult = col.defaultFn();
							const defaultValue = is(defaultFnResult, SQL)
								? defaultFnResult
								: sql.param(defaultFnResult, col);
							valueList.push(defaultValue);
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (!col.default && col.onUpdateFn !== undefined) {
							const onUpdateFnResult = col.onUpdateFn();
							const newValue = is(onUpdateFnResult, SQL)
								? onUpdateFnResult
								: sql.param(onUpdateFnResult, col);
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
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: ignoreSelectionCastCodecs })
			}`
			: undefined;

		const onConflictSql = onConflict
			? sql` on conflict ${onConflict}`
			: undefined;

		const overridingSql = overridingSystemValue_ === true
			? sql`overriding system value `
			: undefined;

		return sql`${withSql}insert into ${table} ${insertOrder} ${overridingSql}${valuesSql}${onConflictSql}${returningSql}${
			comment !== undefined ? sql` ${comment}` : undefined
		}`;
	}

	buildRefreshMaterializedViewQuery({
		view,
		concurrently,
		withNoData,
	}: {
		view: PgMaterializedView;
		concurrently?: boolean;
		withNoData?: boolean;
	}): SQL {
		const concurrentlySql = concurrently ? sql` concurrently` : undefined;
		const withNoDataSql = withNoData ? sql` with no data` : undefined;

		return sql`refresh materialized view${concurrentlySql} ${view}${withNoDataSql}`;
	}

	prepareTyping(
		encoder: DriverValueEncoder<unknown, unknown>,
	): QueryTypingsValue {
		if (is(encoder, PgJsonb) || is(encoder, PgJson)) {
			return 'json';
		} else if (is(encoder, PgNumeric)) {
			return 'decimal';
		} else if (is(encoder, PgTime)) {
			return 'time';
		} else if (is(encoder, PgTimestamp) || is(encoder, PgTimestampString)) {
			return 'timestamp';
		} else if (is(encoder, PgDate) || is(encoder, PgDateString)) {
			return 'date';
		} else if (is(encoder, PgUUID)) {
			return 'uuid';
		} else {
			return 'none';
		}
	}

	sqlToQuery(sql: SQL, invokeSource?: 'indexes' | undefined): QueryWithTypings {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			prepareTyping: this.prepareTyping,
			codecs: this.codecs,
			invokeSource,
		});
	}
	_sqlToQuery(sql: SQL): QueryWithTypings {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			prepareTyping: this.prepareTyping,
			codecs: this.codecs,
			tagged: true,
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
			const casted = inJson && (<PgCustomColumn<any>> column).jsonSelectIdentifier
				? (<PgCustomColumn<any>> column).jsonSelectIdentifier!(name, sql, (<PgCustomColumn<any>> column).dimensions)
				: this.codecs.apply(column, inJson ? 'castInJson' : 'cast', name);

			return sql`${casted} as ${sql.identifier(key)}`;
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
				selection.push(
					is(v, Column)
						? {
							key: k,
							codec: this.codecs.get(v, inJson ? 'normalizeInJson' : 'normalize'),
							arrayDimensions: (<PgColumn> v).dimensions,
							field: v,
						}
						: {
							key: k,
							field: v as SQL | SQLWrapper | SQL.Aliased,
						},
				);

				return this.buildRqbColumn(table, v, k, inJson);
			}),
			sql`, `,
		);
	};

	private buildColumns = (
		table: Table | View,
		selection: BuildRelationalQueryResult['selection'],
		inJson: boolean,
		config?: DBQueryConfigWithComment<'many'>,
	) =>
		config?.columns
			? (() => {
				const entries = Object.entries(config.columns);
				const columnContainer: Record<string, unknown> = table[TableColumns];

				const columnIdentifiers: SQL[] = [];
				let colSelectionMode: boolean | undefined;
				for (const [k, v] of entries) {
					if (v === undefined) continue;
					colSelectionMode = colSelectionMode || v;

					if (v) {
						const column = columnContainer[k];
						columnIdentifiers.push(this.buildRqbColumn(table, column, k, inJson));

						selection.push(
							is(column, Column)
								? {
									key: k,
									codec: this.codecs.get(column, inJson ? 'normalizeInJson' : 'normalize'),
									arrayDimensions: (<PgColumn> column).dimensions,
									field: column,
								}
								: {
									key: k,
									field: column as SQL | SQLWrapper | SQL.Aliased,
								},
						);
					}
				}

				if (colSelectionMode === false) {
					for (const [k, v] of Object.entries(columnContainer)) {
						if (config.columns[k] === false) continue;
						columnIdentifiers.push(this.buildRqbColumn(table, v, k, inJson));

						selection.push(
							is(v, Column)
								? {
									key: k,
									codec: this.codecs.get(v, inJson ? 'normalizeInJson' : 'normalize'),
									arrayDimensions: (<PgColumn> v).dimensions,
									field: v,
								}
								: {
									key: k,
									field: v as SQL | SQLWrapper | SQL.Aliased,
								},
						);
					}
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
		errorPath,
		depth,
		throughJoin,
		nested,
	}: {
		schema: TablesRelationalConfig;
		table: PgTable | PgView;
		tableConfig: TableRelationalConfig;
		queryConfig?: DBQueryConfigWithComment<'many'> | true;
		relationWhere?: SQL;
		mode: 'first' | 'many';
		errorPath?: string;
		depth?: number;
		throughJoin?: SQL;
		nested?: boolean;
	}): BuildRelationalQueryResult {
		const selection: BuildRelationalQueryResult['selection'] = [];
		const isSingle = mode === 'first';
		const params = config === true ? undefined : config;
		const currentPath = errorPath ?? '';
		const currentDepth = depth ?? 0;
		if (!currentDepth) table = aliasedTable(table, `d${currentDepth}`);

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

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
		const columns = this.buildColumns(table, selection, !!nested, params);
		const extras = params?.extras
			? relationExtrasToSQL(table, params.extras)
			: undefined;
		if (extras) selection.push(...extras.selection);

		const selectionArr: SQL[] = columns ? [columns] : [];
		if (extras?.sql) selectionArr.push(extras.sql);

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

						// 	selectionArr.push(sql`${sql.identifier(k)}.${sql.identifier('r')} as ${sql.identifier(k)}`);

						// 	return sql`left join lateral(${query}) as ${sql.identifier(k)} on true`;
						// }

						const relation = tableConfig.relations[k]! as Relation;
						const isSingle = is(relation, One);
						const targetTable = aliasedTable(
							relation.targetTable,
							`d${currentDepth + 1}`,
						);
						const throughTable = relation.throughTable
							? (aliasedTable(relation.throughTable, `tr${currentDepth}`) as
								| Table
								| View)
							: undefined;
						const { filter, joinCondition } = relationToSQL(
							relation,
							table,
							targetTable,
							throughTable,
						);

						selectionArr.push(
							sql`${sql.identifier(k)}.${sql.identifier('r')} as ${sql.identifier(k)}`,
						);

						const throughJoin = throughTable
							? sql` inner join ${getTableAsAliasSQL(throughTable)} on ${joinCondition!}`
							: undefined;

						const innerQuery = this.buildRelationalQuery({
							table: targetTable as PgTable | PgView,
							mode: isSingle ? 'first' : 'many',
							schema,
							queryConfig: join as DBQueryConfigWithComment,
							tableConfig: schema[relation.targetTableName]!,
							relationWhere: filter,
							errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
							depth: currentDepth + 1,
							throughJoin,
							nested: true,
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

		if (!selectionArr.length) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}
		const selectionSet = sql.join(
			selectionArr.filter((e) => e !== undefined),
			sql`, `,
		);
		const comment = config !== true && config?.comment
			? sql.comment(config.comment)
			: undefined;

		const query = sql`select ${selectionSet} from ${getTableAsAliasSQL(table)}${throughJoin}${
			joins ? sql` ${joins}` : undefined
		}${where ? sql` where ${where}` : undefined}${order ? sql` order by ${order}` : undefined}${
			limit !== undefined ? sql` limit ${limit}` : undefined
		}${offset !== undefined ? sql` offset ${offset}` : undefined}${comment ? sql` ${comment}` : undefined}`;

		return {
			sql: query,
			selection,
		};
	}
}
