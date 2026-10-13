/* oxlint-disable unicorn/no-new-array -- preallocating by length is intentional on hot paths */
import * as V1 from '~/_relations.ts';
import {
	aliasedTable,
	aliasedTableColumn,
	getOriginalColumnFromAlias,
	mapColumnsInAliasedSQLToAlias,
	mapColumnsInSQLToAlias,
} from '~/alias.ts';
import { CasingCache } from '~/casing.ts';
import { Column } from '~/column.ts';
import { ChunkKind, chunkKind, entityKind, is } from '~/entity.ts';
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
import { and, eq, isSQLWrapper, type SQLWrapper, View } from '~/sql/index.ts';
import {
	type BuildQueryConfig,
	type DriverValueEncoder,
	INSERT_SQL_SENTINEL,
	type InsertValuesChunk,
	type Name,
	type QueryTypingsValue,
	type QueryWithTypings,
	SQL,
	sql,
	type SQLChunk,
} from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, getTableUniqueName, Table, TableColumns } from '~/table.ts';
import { type Casing, orderSelectedFields, type UpdateSet } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { PgViewBase } from './view-base.ts';
import type { PgMaterializedView, PgView } from './view.ts';

export interface PgDialectConfig {
	casing?: Casing;
}

export class PgDialect {
	static readonly [entityKind]: string = 'PgDialect';

	/** @internal */
	readonly casing: CasingCache;

	/**
	 * @internal Cached per-table insert metadata to avoid re-computing
	 * Object.entries().filter().map() + Name allocations + typing computations on every insert.
	 * WeakMap ensures entries are GC'd when the table is collected.
	 */
	private insertMetaCache = new WeakMap<Table, {
		colEntries: [string, PgColumn][];
		insertOrder: Name[];
		colTypings: QueryTypingsValue[];
	}>();

	/** @internal Get or compute cached insert metadata for a table. */
	private getInsertMeta(table: PgTable): {
		colEntries: [string, PgColumn][];
		insertOrder: Name[];
		colTypings: QueryTypingsValue[];
	} {
		let meta = this.insertMetaCache.get(table);
		if (meta === undefined) {
			const columns: Record<string, PgColumn> = table[Table.Symbol.Columns];
			const colEntries: [string, PgColumn][] = [];
			for (const key of Object.keys(columns)) {
				const col = columns[key]!;
				if (!col.shouldDisableInsert()) {
					colEntries.push([key, col]);
				}
			}
			const insertOrder: Name[] = new Array(colEntries.length);
			const colTypings: QueryTypingsValue[] = new Array(colEntries.length);
			for (let i = 0; i < colEntries.length; i++) {
				const col = colEntries[i]![1];
				insertOrder[i] = sql.identifier(this.casing.getColumnCasing(col));
				colTypings[i] = this.prepareTyping(col);
			}
			meta = { colEntries, insertOrder, colTypings };
			this.insertMetaCache.set(table, meta);
		}
		return meta;
	}

	/**
	 * @internal Cached BuildQueryConfig to avoid allocating a new config object on every sqlToQuery() call.
	 * All properties except `invokeSource` are stable per dialect instance.
	 */
	private readonly queryConfig: BuildQueryConfig;

	constructor(config?: PgDialectConfig) {
		this.casing = new CasingCache(config?.casing);
		this.queryConfig = {
			casing: this.casing,
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			prepareTyping: this.prepareTyping,
		};
	}

	escapeName(name: string): string {
		return `"${name}"`;
	}

	escapeParam(num: number): string {
		return `$${num + 1}`;
	}

	escapeString(str: string): string {
		return `'${str.replace(/'/g, "''")}'`;
	}

	private buildWithCTE(queries: Subquery[] | undefined): SQL | undefined {
		if (!queries?.length) return undefined;

		const withSqlChunks = [sql.WITH];
		for (const [i, w] of queries.entries()) {
			withSqlChunks.push(sql`${sql.identifier(w._.alias)} as (${w._.sql})`);
			if (i < queries.length - 1) {
				withSqlChunks.push(sql.COMMA);
			}
		}
		withSqlChunks.push(sql.SPACE);
		return sql.join(withSqlChunks);
	}

	buildDeleteQuery({ table, where, returning, withList }: PgDeleteConfig): SQL {
		// Direct array construction using pre-allocated constants.
		// Avoids sql`...` tagged template allocations (StringChunk + SQL per fragment).
		const chunks: SQLChunk[] = [];

		if (withList?.length) {
			chunks.push(this.buildWithCTE(withList)!);
		}

		chunks.push(sql.RAW_DELETE_FROM, table);

		if (where) {
			chunks.push(sql.RAW_WHERE, where);
		}

		if (returning) {
			chunks.push(sql.RAW_RETURNING, this.buildSelection(returning, true));
		}

		return new SQL(chunks);
	}

	buildUpdateSet(table: PgTable, set: UpdateSet): SQL {
		const tableColumns = table[Table.Symbol.Columns];
		const keys = Object.keys(tableColumns);
		const chunks: SQLChunk[] = [];

		for (let i = 0; i < keys.length; i++) {
			const colName = keys[i]!;
			const col = tableColumns[colName]!;
			const setValue = set[colName];

			if (setValue === undefined && col.onUpdateFn === undefined) continue;

			if (chunks.length > 0) chunks.push(sql.RAW_COMMA);

			const onUpdateFnResult = col.onUpdateFn?.();
			const value = setValue
				?? ((onUpdateFnResult as any)?.[chunkKind] === ChunkKind.SQL
					? onUpdateFnResult as SQL
					: sql.param(onUpdateFnResult, col));
			chunks.push(sql`${sql.identifier(this.casing.getColumnCasing(col))} = ${value}`);
		}

		return new SQL(chunks);
	}

	buildUpdateQuery({ table, set, where, returning, withList, from, joins }: PgUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const tableName = table[PgTable.Symbol.Name];
		const tableSchema = table[PgTable.Symbol.Schema];
		const origTableName = table[PgTable.Symbol.OriginalName];
		const alias = tableName === origTableName ? undefined : tableName;
		const tableSql = sql`${tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined}${
			sql.identifier(origTableName)
		}${alias && sql` ${sql.identifier(alias)}`}`;

		const setSql = this.buildUpdateSet(table, set);

		const fromSql = from && sql.join([sql.RAW_FROM, this.buildFromTable(from)]);

		const joinsSql = this.buildJoins(joins);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, !from)}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`${withSql}update ${tableSql} set ${setSql}${fromSql}${joinsSql}${whereSql}${returningSql}`;
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
		isSingleTable: boolean = false,
	): SQL {
		const columnsLen = fields.length;

		// Single result array — no per-field chunk[] arrays, no flatMap.
		const result: SQLChunk[] = [];

		for (let i = 0; i < columnsLen; i++) {
			const field = fields[i]!.field;

			// Fast dispatch via chunkKind discriminant instead of is() cascade.
			const kind = (field as any)?.[chunkKind];

			if (kind === ChunkKind.SQLAliased) {
				const aliased = field as SQL.Aliased;
				if (aliased.isSelectionField) {
					if (!isSingleTable && aliased.origin !== undefined) {
						result.push(sql.identifier(aliased.origin), sql.RAW_DOT);
					}
					result.push(sql.identifier(aliased.fieldAlias));
				} else {
					const query = aliased.sql;
					if (isSingleTable) {
						const newSql = this.mapSQLChunkColumns(query);
						result.push(query.shouldInlineParams ? newSql.inlineParams() : newSql);
					} else {
						result.push(query);
					}
					result.push(sql.RAW_AS, sql.identifier(aliased.fieldAlias));
				}
			} else if (kind === ChunkKind.SQL) {
				const query = field as SQL;
				if (isSingleTable) {
					const newSql = this.mapSQLChunkColumns(query);
					result.push(query.shouldInlineParams ? newSql.inlineParams() : newSql);
				} else {
					result.push(query);
				}
			} else if (kind === ChunkKind.Column) {
				const col = field as Column;
				if (isSingleTable) {
					if (col.isAlias) {
						result.push(
							sql.identifier(this.casing.getColumnCasing(getOriginalColumnFromAlias(col))),
							sql.RAW_AS,
							col,
						);
					} else {
						result.push(sql.identifier(this.casing.getColumnCasing(col)));
					}
				} else {
					if (col.isAlias) {
						result.push(getOriginalColumnFromAlias(col), sql.RAW_AS, col);
					} else {
						result.push(col);
					}
				}
			} else if (kind === ChunkKind.Subquery) {
				const sub = field as Subquery;
				const entries = Object.entries(sub._.selectedFields) as [string, SQL.Aliased | Column | SQL][];

				if (entries.length === 1) {
					const entry = entries[0]![1];
					const entryKind = (entry as any)?.[chunkKind];

					const fieldDecoder = entryKind === ChunkKind.SQL
						? (entry as SQL).decoder
						: entryKind === ChunkKind.Column
						? { mapFromDriverValue: (v: any) => (entry as Column).mapFromDriverValue(v) }
						: (entry as SQL.Aliased).sql.decoder;

					if (fieldDecoder) {
						sub._.sql.decoder = fieldDecoder;
					}
				}
				result.push(sub);
			}

			if (i < columnsLen - 1) {
				result.push(sql.COMMA);
			}
		}

		return new SQL(result);
	}

	/** @internal Map PgColumn chunks in a SQL's queryChunks to identifiers. Used by buildSelection for isSingleTable mode. */
	private mapSQLChunkColumns(query: SQL): SQL {
		const chunks = query.queryChunks;
		let needsMapping = false;
		for (let j = 0; j < chunks.length; j++) {
			if ((chunks[j] as any)?.[chunkKind] === ChunkKind.Column) {
				needsMapping = true;
				break;
			}
		}
		if (!needsMapping) return query;
		const mapped: SQLChunk[] = new Array(chunks.length);
		for (let j = 0; j < chunks.length; j++) {
			const c = chunks[j]!;
			mapped[j] = (c as any)?.[chunkKind] === ChunkKind.Column
				? sql.identifier(this.casing.getColumnCasing(c as PgColumn))
				: c;
		}
		return new SQL(mapped);
	}

	private buildJoins(joins: PgSelectJoinConfig[] | undefined): SQL | undefined {
		if (!joins || joins.length === 0) {
			return undefined;
		}

		const joinsArray: SQL[] = [];

		for (const [index, joinMeta] of joins.entries()) {
			if (index === 0) {
				joinsArray.push(sql.SPACE);
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
				joinsArray.push(sql.SPACE);
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
		}: PgSelectConfig,
	): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<PgColumn>(fields);
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

		let distinctSql: SQL | undefined;
		if (distinct) {
			distinctSql = distinct === true ? sql.DISTINCT : sql` distinct on (${sql.join(distinct.on, sql.COMMA)})`;
		}

		const selection = this.buildSelection(fieldsList, isSingleTable);

		const tableSql = this.buildFromTable(table);

		const joinsSql = this.buildJoins(joins);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			orderBySql = sql` order by ${sql.join(orderBy, sql.COMMA)}`;
		}

		let groupBySql;
		if (groupBy && groupBy.length > 0) {
			groupBySql = sql` group by ${sql.join(groupBy, sql.COMMA)}`;
		}

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		let lockingClauseSql: SQL | undefined;
		if (lockingClause) {
			lockingClauseSql = sql` for ${sql.raw(lockingClause.strength)}`;
			if (lockingClause.config.of) {
				lockingClauseSql.append(
					sql` of ${
						sql.join(
							Array.isArray(lockingClause.config.of)
								? lockingClause.config.of.map((it) => sql.identifier(it[PgTable.Symbol.Name]))
								: [sql.identifier(lockingClause.config.of[PgTable.Symbol.Name])],
							sql.COMMA,
						)
					}`,
				);
			}
			if (lockingClause.config.noWait) {
				lockingClauseSql.append(sql.NOWAIT);
			} else if (lockingClause.config.skipLocked) {
				lockingClauseSql.append(sql.SKIP_LOCKED);
			}
		}
		const finalQuery =
			sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}${lockingClauseSql}`;

		if (setOperators.length > 0) {
			return this.buildSetOperations(finalQuery, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(leftSelect: SQL, setOperators: PgSelectConfig['setOperators']): SQL {
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
	}: { leftSelect: SQL; setOperator: PgSelectConfig['setOperators'][number] }): SQL {
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

			orderBySql = sql` order by ${sql.join(orderByValues, sql.COMMA)} `;
		}

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const operatorChunk = sql.raw(`${type} ${isAll ? 'all ' : ''}`);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery(
		{ table, values: valuesOrSelect, onConflict, returning, withList, select, overridingSystemValue_ }: PgInsertConfig,
	): SQL {
		// Use cached column metadata — avoids Object.entries().filter().map(), Name allocations,
		// and prepareTyping() is() checks on every call for the same table.
		const { colEntries, insertOrder, colTypings } = this.getInsertMeta(table);

		let valuesSql: SQL;
		if (select) {
			const select = valuesOrSelect as AnyPgSelectQueryBuilder | SQL;
			const selectSql = is(select, SQL) ? select : select.getSQL();
			valuesSql = selectSql;
		} else {
			const values = valuesOrSelect as Record<string, unknown>[];
			const numCols = colEntries.length;

			// Pre-map all values and pack into InsertValuesChunk
			const numRows = values.length;
			const rows: unknown[][] = new Array(numRows);
			let sqlCells: Map<number, SQL> | null = null;

			for (let r = 0; r < numRows; r++) {
				const value = values[r]!;
				const row: unknown[] = new Array(numCols);
				for (let c = 0; c < numCols; c++) {
					const [fieldName, col] = colEntries[c]!;
					const colValue = value[fieldName];
					if (colValue === undefined) {
						// eslint-disable-next-line unicorn/no-negated-condition
						if (col.defaultFn !== undefined) {
							const defaultFnResult = col.defaultFn();
							if ((defaultFnResult as any)?.[chunkKind] === ChunkKind.SQL) {
								(sqlCells ??= new Map()).set(r * numCols + c, defaultFnResult as SQL);
								row[c] = INSERT_SQL_SENTINEL;
							} else {
								const mapped = defaultFnResult === null
									? null
									: col.mapToDriverValue(defaultFnResult);
								row[c] = mapped;
							}
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (!col.default && col.onUpdateFn !== undefined) {
							const onUpdateFnResult = col.onUpdateFn();
							if ((onUpdateFnResult as any)?.[chunkKind] === ChunkKind.SQL) {
								(sqlCells ??= new Map()).set(r * numCols + c, onUpdateFnResult as SQL);
								row[c] = INSERT_SQL_SENTINEL;
							} else {
								const mapped = onUpdateFnResult === null
									? null
									: col.mapToDriverValue(onUpdateFnResult);
								row[c] = mapped;
							}
						} else {
							(sqlCells ??= new Map()).set(r * numCols + c, sql.DEFAULT);
							row[c] = INSERT_SQL_SENTINEL;
						}
					} else if ((colValue as any)?.[chunkKind] === ChunkKind.SQL) {
						// Raw SQL expression passed as column value
						(sqlCells ??= new Map()).set(r * numCols + c, colValue as SQL);
						row[c] = INSERT_SQL_SENTINEL;
					} else {
						// Common case: plain value — pre-map to driver value
						const mapped = colValue === null ? null : col.mapToDriverValue(colValue);
						if ((mapped as any)?.[chunkKind] === ChunkKind.SQL) {
							// Custom column mapToDriverValue returned SQL
							(sqlCells ??= new Map()).set(r * numCols + c, mapped as SQL);
							row[c] = INSERT_SQL_SENTINEL;
						} else {
							row[c] = mapped;
						}
					}
				}
				rows[r] = row;
			}

			const insertValuesChunk: InsertValuesChunk = {
				[chunkKind]: ChunkKind.InsertValues,
				rows,
				typings: colTypings,
				sqlCells,
				numCols,
			};
			// Construct valuesSql directly — avoids sql.join() intermediate array + SQL wrapper
			valuesSql = new SQL([sql.RAW_VALUES, insertValuesChunk as any]);
		}

		// Direct array construction using pre-allocated constants.
		// Avoids sql`...` tagged template allocations (StringChunk + SQL per fragment).
		const chunks: SQLChunk[] = [];

		if (withList?.length) {
			chunks.push(this.buildWithCTE(withList)!);
		}

		chunks.push(sql.RAW_INSERT_INTO, table, sql.SPACE, insertOrder as any, sql.SPACE);

		if (overridingSystemValue_ === true) {
			chunks.push(sql.RAW_OVERRIDING_SYSTEM_VALUE);
		}

		chunks.push(valuesSql);

		if (onConflict) {
			chunks.push(sql.RAW_ON_CONFLICT, onConflict);
		}

		if (returning) {
			chunks.push(sql.RAW_RETURNING, this.buildSelection(returning, true));
		}

		return new SQL(chunks);
	}

	buildRefreshMaterializedViewQuery(
		{ view, concurrently, withNoData }: { view: PgMaterializedView; concurrently?: boolean; withNoData?: boolean },
	): SQL {
		const concurrentlySql = concurrently ? sql` concurrently` : undefined;
		const withNoDataSql = withNoData ? sql` with no data` : undefined;

		return sql`refresh materialized view${concurrentlySql} ${view}${withNoDataSql}`;
	}

	prepareTyping(encoder: DriverValueEncoder<unknown, unknown>): QueryTypingsValue {
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
		if (invokeSource !== undefined) {
			// Rare path (only index building) — allocate a one-off config with invokeSource set.
			return sql.toQuery({ ...this.queryConfig, invokeSource });
		}
		return sql.toQuery(this.queryConfig);
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
		table: PgTable;
		tableConfig: V1.TableRelationalConfig;
		queryConfig: true | V1.DBQueryConfig<'many', true>;
		tableAlias: string;
		nestedQueryRelation?: V1.Relation;
		joinOn?: SQL;
	}): V1.BuildRelationalQueryResult<PgTable, PgColumn> {
		let selection: V1.BuildRelationalQueryResult<PgTable, PgColumn>['selection'] = [];
		let limit, offset, orderBy: NonNullable<PgSelectConfig['orderBy']> = [], where;
		const joins: PgSelectJoinConfig[] = [];

		if (config === true) {
			const selectionEntries = Object.entries(tableConfig.columns);
			selection = selectionEntries.map((
				[key, value],
			) => ({
				dbKey: value.name,
				tsKey: key,
				field: aliasedTableColumn(value as PgColumn, tableAlias),
				relationTableTsKey: undefined,
				isJson: false,
				selection: [],
			}));
		} else {
			const aliasedColumns = Object.fromEntries(
				Object.entries(tableConfig.columns).map((
					[key, value],
				) => [key, aliasedTableColumn(value, tableAlias)]),
			);

			if (config.where) {
				const whereSql = typeof config.where === 'function'
					? config.where(aliasedColumns, V1.getOperators())
					: config.where;
				where = whereSql && mapColumnsInSQLToAlias(whereSql, tableAlias);
			}

			const fieldsSelection: { tsKey: string; value: PgColumn | SQL.Aliased }[] = [];
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
				const column = tableConfig.columns[field]! as PgColumn;
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
					return aliasedTableColumn(orderByValue, tableAlias) as PgColumn;
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
					table: fullSchema[relationTableTsName] as PgTable,
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
				const field = sql`${sql.identifier(relationTableAlias)}.${sql.identifier('data')}`.as(selectedRelationTsKey);
				joins.push({
					on: sql.TRUE,
					table: new Subquery(builtRelation.sql as SQL, {}, relationTableAlias),
					alias: relationTableAlias,
					joinType: 'left',
					lateral: true,
				});
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
			throw new DrizzleError({ message: `No fields selected for table "${tableConfig.tsName}" ("${tableAlias}")` });
		}

		let result;

		where = and(joinOn, where);

		if (nestedQueryRelation) {
			let field = sql`json_build_array(${
				sql.join(
					selection.map(({ field, tsKey, isJson }) =>
						isJson
							? sql`${sql.identifier(`${tableAlias}_${tsKey}`)}.${sql.identifier('data')}`
							: is(field, SQL.Aliased)
							? field.sql
							: field
					),
					sql.COMMA,
				)
			})`;
			if (is(nestedQueryRelation, V1.Many)) {
				field = sql`coalesce(json_agg(${field}${
					orderBy.length > 0 ? sql` order by ${sql.join(orderBy, sql.COMMA)}` : undefined
				}), '[]'::json)`;
				// orderBy = [];
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
					fieldsFlat: [{
						path: [],
						field: sql.RAW_STAR,
					}],
					where,
					limit,
					offset,
					orderBy,
					setOperators: [],
				});

				where = undefined;
				limit = undefined;
				offset = undefined;
				orderBy = [];
			} else {
				result = aliasedTable(table, tableAlias);
			}

			result = this.buildSelectQuery({
				table: is(result, PgTable) ? result : new Subquery(result, {}, tableAlias),
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
			const targetType = column.columnType;
			// Get dimension count directly from PgColumn.dimensions
			const dimensionCnt = is(column, PgColumn) ? column.dimensions : 0;

			switch (targetType) {
				case 'PgNumeric':
				case 'PgNumericNumber':
				case 'PgNumericBigInt':
				case 'PgBigInt64':
				case 'PgBigIntString':
				case 'PgBigSerial64':
				case 'PgTimestampString':
				case 'PgGeometry':
				case 'PgGeometryObject':
				case 'PgBytea': {
					const arrVal = '[]'.repeat(dimensionCnt);

					return sql`${name}::text${sql.raw(arrVal).if(arrVal)} as ${sql.identifier(key)}`;
				}
				case 'PgCustomColumn': {
					return sql`${
						(<PgCustomColumn<any>> column).jsonSelectIdentifier(
							name,
							sql,
							dimensionCnt > 0 ? dimensionCnt : undefined,
						)
					} as ${sql.identifier(key)}`;
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
			Object.entries(table[TableColumns]).map(([k, v]) => {
				selection.push({
					key: k,
					field: v as Column | SQL | SQLWrapper | SQL.Aliased,
				});

				return this.buildRqbColumn(table, v, k);
			}),
			sql.COMMA,
		);
	};

	private buildColumns = (
		table: Table | View,
		selection: BuildRelationalQueryResult['selection'],
		config?: DBQueryConfig<'many'>,
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
						columnIdentifiers.push(
							this.buildRqbColumn(table, column, k),
						);

						selection.push({
							key: k,
							field: column as SQL | SQLWrapper | SQL.Aliased | Column,
						});
					}
				}

				if (colSelectionMode === false) {
					for (const [k, v] of Object.entries(columnContainer)) {
						if (config.columns[k] === false) continue;
						columnIdentifiers.push(this.buildRqbColumn(table, v, k));

						selection.push({
							key: k,
							field: v as SQL | SQLWrapper | SQL.Aliased | Column,
						});
					}
				}

				return columnIdentifiers.length
					? sql.join(columnIdentifiers, sql.COMMA)
					: undefined;
			})()
			: this.unwrapAllColumns(table, selection);

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
		table: PgTable | PgView;
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
		if (!currentDepth) table = aliasedTable(table, `d${currentDepth}`);

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

		const where: SQL | undefined = (params?.where && relationWhere)
			? and(
				relationsFilterToSQL(table, params.where, tableConfig.relations, schema, this.casing),
				relationWhere,
			)
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
						const targetTable = aliasedTable(relation.targetTable, `d${currentDepth + 1}`);
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

						const throughJoin = throughTable
							? sql` inner join ${getTableAsAliasSQL(throughTable)} on ${joinCondition!}`
							: undefined;

						const innerQuery = this.buildRelationalQuery({
							table: targetTable as PgTable | PgView,
							mode: isSingle ? 'first' : 'many',
							schema,
							queryConfig: join as DBQueryConfig,
							tableConfig: schema[relation.targetTableName]!,
							relationWhere: filter,
							errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
							depth: currentDepth + 1,
							throughJoin,
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
					sql.SPACE,
				);
			})()
			: undefined;

		if (extras?.sql) selectionArr.push(extras.sql);
		if (!selectionArr.length) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}
		const selectionSet = sql.join(selectionArr.filter((e) => e !== undefined), sql.COMMA);
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
