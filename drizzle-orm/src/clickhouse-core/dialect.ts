import { aliasedTable, aliasedTableColumn, mapColumnsInAliasedSQLToAlias, mapColumnsInSQLToAlias } from '~/alias.ts';
import { CasingCache } from '~/casing.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import { and, eq } from '~/sql/expressions/index.ts';
import type { Name, QueryWithTypings, SQLChunk } from '~/sql/sql.ts';
import { Param, Placeholder, SQL, sql, View } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, Table } from '~/table.ts';
import { type Casing, orderSelectedFields, type UpdateSet } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { ClickHouseColumn } from './columns/common.ts';
import { type ClickHouseSettings, settingsSQL } from './engines.ts';
import { escapeClickHouseIdentifier, escapeClickHouseString } from './literals.ts';
import type { ClickHouseDeleteConfig } from './query-builders/delete.ts';
import { ClickHouseInsertValueError } from './errors.ts';
import type { ClickHouseInsertConfig } from './query-builders/insert.ts';
import type {
	ClickHouseSelectConfig,
	ClickHouseSelectJoinConfig,
	SelectedFieldsOrdered,
} from './query-builders/select.types.ts';
import type { ClickHouseUpdateConfig } from './query-builders/update.ts';
import type { ClickHouseSession } from './session.ts';
import { ClickHouseTable } from './table.ts';
import { getTableConfig } from './utils.ts';

export interface ClickHouseDialectConfig {
	casing?: Casing;
}

export class ClickHouseDialect {
	static readonly [entityKind]: string = 'ClickHouseDialect';

	/** @internal */
	readonly casing: CasingCache;

	constructor(config?: ClickHouseDialectConfig) {
		this.casing = new CasingCache(config?.casing);
	}

	/**
	 * Applies pending migrations.
	 *
	 * Unlike the other dialects this does not wrap the run in a transaction — ClickHouse has no usable
	 * one. Each statement is applied on its own, and the bookkeeping row is written only after a
	 * migration's statements have all succeeded, so a failure part-way leaves that migration marked as
	 * unapplied and it will be retried.
	 */
	async migrate(
		migrations: MigrationMeta[],
		session: ClickHouseSession,
		config: Omit<MigrationConfig, 'migrationsSchema'>,
	): Promise<void> {
		const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';
		const migrationTableCreate = sql`
			create table if not exists ${sql.identifier(migrationsTable)} (
				hash String,
				created_at Int64
			)
			engine = MergeTree()
			order by created_at
		`;
		await session.execute(migrationTableCreate);

		const dbMigrations = await session.all<{ hash: string; created_at: string }>(
			sql`select hash, created_at from ${sql.identifier(migrationsTable)} order by created_at desc limit 1`,
		);

		const lastDbMigration = dbMigrations[0];

		for (const migration of migrations) {
			if (lastDbMigration && Number(lastDbMigration.created_at) >= migration.folderMillis) {
				continue;
			}

			for (const stmt of migration.sql) {
				await session.execute(sql.raw(stmt));
			}

			await session.execute(
				sql`insert into ${sql.identifier(migrationsTable)} (hash, created_at) values (${migration.hash}, ${
					sql.raw(String(migration.folderMillis))
				})`,
			);
		}
	}

	escapeName(name: string): string {
		return escapeClickHouseIdentifier(name);
	}

	/**
	 * ClickHouse has no bind-parameter protocol, so every value is rendered inline as a literal —
	 * see `literals.ts` for why. `escapeParam` is therefore never reached: `sqlToQuery` always builds
	 * queries with `inlineParams` set.
	 */
	escapeParam(_num: number, _value: unknown): string {
		throw new Error('ClickHouse renders parameters inline; escapeParam should not be reached');
	}

	escapeString(str: string): string {
		return escapeClickHouseString(str);
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

	private buildSettings(settings: ClickHouseSettings | undefined): SQL | undefined {
		return settings && Object.keys(settings).length > 0 ? sql` settings ${settingsSQL(settings)}` : undefined;
	}

	/**
	 * Rewrites qualified `` `table`.`column` `` references to bare `` `column` `` ones.
	 *
	 * `ALTER TABLE … UPDATE` and lightweight `DELETE FROM` are rewritten by ClickHouse into
	 * expressions evaluated against the table's columns directly, with no table name in scope — a
	 * qualified reference there fails with `UNKNOWN_IDENTIFIER`. Both forms are single-table, so
	 * dropping the qualifier is unambiguous.
	 */
	private unqualifyColumns(value: SQL): SQL {
		const rewrite = (chunk: SQLChunk): SQLChunk => {
			if (is(chunk, ClickHouseColumn)) {
				return sql.identifier(this.casing.getColumnCasing(chunk));
			}
			if (is(chunk, SQL)) {
				return this.unqualifyColumns(chunk);
			}
			if (Array.isArray(chunk)) {
				return chunk.map((inner) => rewrite(inner)) as SQLChunk;
			}
			return chunk;
		};

		return new SQL(value.queryChunks.map((chunk) => rewrite(chunk)));
	}

	/**
	 * Builds a `DELETE`.
	 *
	 * The default is a lightweight `DELETE FROM … WHERE`, which ClickHouse supports from 22.8 onwards.
	 * `.mutation()` switches to `ALTER TABLE … DELETE WHERE`, which works on older servers and on
	 * engines where lightweight deletes are unavailable.
	 *
	 * Either form requires a `WHERE`, so a delete with no filter becomes `WHERE 1` — a deliberate
	 * "delete everything" rather than a syntax error.
	 */
	buildDeleteQuery({ table, where, mutation, settings }: ClickHouseDeleteConfig): SQL {
		const whereSql = sql` where ${where ? this.unqualifyColumns(where) : sql`1`}`;
		const settingsSql = this.buildSettings(settings);

		return mutation
			? sql`alter table ${table} delete${whereSql}${settingsSql}`
			: sql`delete from ${table}${whereSql}${settingsSql}`;
	}

	buildUpdateSet(table: ClickHouseTable, set: UpdateSet): SQL {
		const tableColumns = table[Table.Symbol.Columns];

		const columnNames = Object.keys(tableColumns).filter(
			(colName) => set[colName] !== undefined || tableColumns[colName]?.onUpdateFn !== undefined,
		);

		const setSize = columnNames.length;
		return sql.join(
			columnNames.flatMap((colName, i) => {
				const col = tableColumns[colName]!;

				const onUpdateFnResult = col.onUpdateFn?.();
				const value = set[colName]
					?? (is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col));
				const res = sql`${sql.identifier(this.casing.getColumnCasing(col))} = ${value}`;

				if (i < setSize - 1) {
					return [res, sql.raw(', ')];
				}
				return [res];
			}),
		);
	}

	/**
	 * Builds an `ALTER TABLE … UPDATE`, ClickHouse's mutation form of `UPDATE`.
	 *
	 * Mutations are asynchronous: the statement returns once accepted, and the rewrite happens in the
	 * background. Pass `.settings({ mutations_sync: 2 })` to block until it has finished everywhere.
	 */
	buildUpdateQuery({ table, set, where, settings }: ClickHouseUpdateConfig): SQL {
		const setSql = this.unqualifyColumns(this.buildUpdateSet(table, set));
		const whereSql = sql` where ${where ? this.unqualifyColumns(where) : sql`1`}`;
		const settingsSql = this.buildSettings(settings);

		return sql`alter table ${table} update ${setSql}${whereSql}${settingsSql}`;
	}

	/**
	 * Builds selection SQL with provided fields/expressions
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

			if (is(field, SQL.Aliased) && field.isSelectionField) {
				chunk.push(sql.identifier(field.fieldAlias));
			} else if (is(field, SQL.Aliased) || is(field, SQL)) {
				const query = is(field, SQL.Aliased) ? field.sql : field;

				if (isSingleTable) {
					chunk.push(
						new SQL(
							query.queryChunks.map((c) => {
								if (is(c, ClickHouseColumn)) {
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
				if (isSingleTable) {
					chunk.push(sql.identifier(this.casing.getColumnCasing(field)));
				} else {
					chunk.push(field);
				}
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

	private buildLimit(limit: number | Placeholder | undefined): SQL | undefined {
		return typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;
	}

	private buildOrderBy(orderBy: (ClickHouseColumn | SQL | SQL.Aliased)[] | undefined): SQL | undefined {
		return orderBy && orderBy.length > 0 ? sql` order by ${sql.join(orderBy, sql`, `)}` : undefined;
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
		final,
		prewhere,
		sample,
		arrayJoins,
		limitBy,
		withTotals,
		settings,
	}: ClickHouseSelectConfig): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<ClickHouseColumn>(fields);
		for (const f of fieldsList) {
			if (
				is(f.field, Column)
				&& getTableName(f.field.table)
					!== (is(table, Subquery)
						? table._.alias
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

		const tableSql = (() => {
			if (is(table, Table) && table[Table.Symbol.IsAlias]) {
				return sql`${sql`${sql.identifier(table[Table.Symbol.Schema] ?? '')}.`.if(table[Table.Symbol.Schema])}${
					sql.identifier(table[Table.Symbol.OriginalName])
				} ${sql.identifier(table[Table.Symbol.Name])}`;
			}

			return table;
		})();

		// `FINAL` and `SAMPLE` bind to the table expression, before any joins.
		const finalSql = final ? sql` final` : undefined;
		const sampleSql = sample
			? sql` sample ${sql.raw(String(sample.value))}${
				sample.offset === undefined ? undefined : sql` offset ${sql.raw(String(sample.offset))}`
			}`
			: undefined;

		const joinsSql = sql.join(this.buildJoins(joins));

		const arrayJoinsSql = arrayJoins?.length
			? sql.join(
				arrayJoins.map((arrayJoin) =>
					sql` ${sql.raw(arrayJoin.left ? 'left array join' : 'array join')} ${
						sql.join(arrayJoin.expressions, sql`, `)
					}`
				),
			)
			: undefined;

		const prewhereSql = prewhere ? sql` prewhere ${prewhere}` : undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		const groupBySql = groupBy && groupBy.length > 0
			? sql` group by ${sql.join(groupBy, sql`, `)}${withTotals ? sql` with totals` : undefined}`
			: undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		// `LIMIT n BY expr` sits between ORDER BY and the plain LIMIT.
		const limitBySql = limitBy
			? sql` limit ${limitBy.limit}${limitBy.offset === undefined ? undefined : sql` offset ${limitBy.offset}`} by ${
				sql.join(limitBy.expressions, sql`, `)
			}`
			: undefined;

		const limitSql = this.buildLimit(limit);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		const settingsSql = this.buildSettings(settings);

		const finalQuery =
			sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${finalSql}${sampleSql}${joinsSql}${arrayJoinsSql}${prewhereSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitBySql}${limitSql}${offsetSql}${settingsSql}`;

		if (setOperators.length > 0) {
			return this.buildSetOperations(finalQuery, setOperators);
		}

		return finalQuery;
	}

	private buildJoins(joins: ClickHouseSelectJoinConfig[] | undefined): SQL[] {
		const joinsArray: SQL[] = [];

		if (!joins) return joinsArray;

		for (const [index, joinMeta] of joins.entries()) {
			if (index === 0) {
				joinsArray.push(sql` `);
			}
			const table = joinMeta.table;
			const globalSql = joinMeta.global ? sql`global ` : undefined;
			const strictnessSql = joinMeta.strictness ? sql`${sql.raw(joinMeta.strictness)} ` : undefined;
			const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : undefined;
			// `CROSS JOIN` takes no strictness modifier and no `ON`.
			const joinPrefix = joinMeta.joinType === 'cross'
				? sql`${globalSql}cross`
				: sql`${globalSql}${strictnessSql}${sql.raw(joinMeta.joinType)}`;

			if (is(table, ClickHouseTable)) {
				const tableName = table[ClickHouseTable.Symbol.Name];
				const tableSchema = table[ClickHouseTable.Symbol.Schema];
				const origTableName = table[ClickHouseTable.Symbol.OriginalName];
				const alias = tableName === origTableName ? undefined : joinMeta.alias;
				joinsArray.push(
					sql`${joinPrefix} join ${tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined}${
						sql.identifier(origTableName)
					}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
				);
			} else if (is(table, View)) {
				const viewName = table[ViewBaseConfig].name;
				const viewSchema = table[ViewBaseConfig].schema;
				const origViewName = table[ViewBaseConfig].originalName;
				const alias = viewName === origViewName ? undefined : joinMeta.alias;
				joinsArray.push(
					sql`${joinPrefix} join ${viewSchema ? sql`${sql.identifier(viewSchema)}.` : undefined}${
						sql.identifier(origViewName)
					}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
				);
			} else {
				joinsArray.push(sql`${joinPrefix} join ${table}${onSql}`);
			}
			if (index < joins.length - 1) {
				joinsArray.push(sql` `);
			}
		}

		return joinsArray;
	}

	buildSetOperations(leftSelect: SQL, setOperators: ClickHouseSelectConfig['setOperators']): SQL {
		const [setOperator, ...rest] = setOperators;

		if (!setOperator) {
			throw new Error('Cannot pass undefined values to any set operator');
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
	}: {
		leftSelect: SQL;
		setOperator: ClickHouseSelectConfig['setOperators'][number];
	}): SQL {
		const leftChunk = sql`(${leftSelect.getSQL()}) `;
		const rightChunk = sql`(${rightSelect.getSQL()})`;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: (SQL<unknown> | Name)[] = [];

			// A qualified `table`.`column` reference is not valid in the outer ORDER BY of a set
			// operation, so columns are reduced to their bare names.
			for (const orderByUnit of orderBy) {
				if (is(orderByUnit, ClickHouseColumn)) {
					orderByValues.push(sql.identifier(this.casing.getColumnCasing(orderByUnit)));
				} else if (is(orderByUnit, SQL)) {
					for (let i = 0; i < orderByUnit.queryChunks.length; i++) {
						const chunk = orderByUnit.queryChunks[i];

						if (is(chunk, ClickHouseColumn)) {
							orderByUnit.queryChunks[i] = sql.identifier(this.casing.getColumnCasing(chunk));
						}
					}

					orderByValues.push(sql`${orderByUnit}`);
				} else {
					orderByValues.push(sql`${orderByUnit}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)} `;
		}

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const operatorChunk = sql.raw(`${type} ${isAll ? 'all ' : 'distinct '}`);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
	}

	/**
	 * Builds an `INSERT`.
	 *
	 * Columns are always listed explicitly so that the row order in `values()` does not have to match
	 * the table's column order. Computed (`MATERIALIZED`/`ALIAS`) columns are excluded, since
	 * ClickHouse rejects writes to them.
	 */
	buildInsertQuery({ table, values, select, settings }: ClickHouseInsertConfig): SQL {
		const settingsSql = this.buildSettings(settings);

		const columns: Record<string, ClickHouseColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, ClickHouseColumn][] = Object.entries(columns)
			.filter(([, col]) => !col.shouldDisableInsert());

		const insertOrder = colEntries.map(([, column]) => sql.identifier(this.casing.getColumnCasing(column)));

		if (select) {
			return sql`insert into ${table} ${select}${settingsSql}`;
		}

		if (!values) {
			throw new Error('An insert must be given either values() or select()');
		}

		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];

		for (const [valueIndex, value] of values.entries()) {
			const valueList: (SQLChunk | SQL)[] = [];
			for (const [fieldName, col] of colEntries) {
				const colValue = value[fieldName];
				if (colValue === undefined || (is(colValue, Param) && colValue.value === undefined)) {
					if (col.defaultFn !== undefined) {
						const defaultFnResult = col.defaultFn();
						valueList.push(is(defaultFnResult, SQL) ? defaultFnResult : sql.param(defaultFnResult, col));
					} else if (!col.default && col.onUpdateFn !== undefined) {
						const onUpdateFnResult = col.onUpdateFn();
						valueList.push(is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col));
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

		const valuesSql = sql.join(valuesSqlList);

		return sql`insert into ${table} ${insertOrder} values ${valuesSql}${settingsSql}`;
	}

	/**
	 * The insert target as ClickHouse should see it — quoted, and schema-qualified when the table
	 * declares one. The driver's row-format insert takes a table *name*, not an expression, so it
	 * cannot go through the ordinary table rendering.
	 */
	insertTargetName(table: ClickHouseTable): string {
		return this.sqlToQuery(sql`${table}`).sql;
	}

	/** The statement that precedes a row-format body: `insert into t format JSONEachRow`. */
	buildInsertRowsQuery(table: ClickHouseTable, format: string): SQL {
		return sql`insert into ${table} format ${sql.raw(format)}`;
	}

	/**
	 * One row as a row format carries it: ClickHouse column names, values through
	 * {@link ClickHouseColumn.mapToRowValue}.
	 *
	 * A column the row does not mention is **omitted rather than defaulted here**, because
	 * `JSONEachRow` matches by name and the server applies that column's own `DEFAULT` — which is the
	 * one the table declares, and therefore the one a `CREATE TABLE` and an `ALTER … ADD COLUMN` agree
	 * on. A Drizzle-side `$defaultFn` is still evaluated, since nothing server-side knows about it.
	 *
	 * Throws on a value there is no way to send: a body has nowhere to put an expression, so
	 * `sql\`now()\`` and placeholders belong to the statement path. The insert builder routes rows
	 * carrying either there automatically, so reaching this is either a stream that yields one or a
	 * caller that forced the format.
	 */
	mapRowForInsert(table: ClickHouseTable, entry: Record<string, unknown>): Record<string, unknown> {
		const columns: Record<string, ClickHouseColumn> = table[Table.Symbol.Columns];

		for (const key of Object.keys(entry)) {
			if (!(key in columns)) {
				throw new ClickHouseInsertValueError(
					`Column "${key}" does not exist on table "${getTableName(table)}". A row format matches by `
						+ `name, so an unrecognised key would be dropped by the server rather than rejected.`,
				);
			}
		}

		const row: Record<string, unknown> = {};
		for (const [fieldName, column] of Object.entries(columns)) {
			if (column.shouldDisableInsert()) continue;

			let value = entry[fieldName];
			if (value === undefined && column.defaultFn !== undefined) {
				value = column.defaultFn();
			}
			if (value === undefined) continue;

			if (is(value, SQL) || is(value, Param) || is(value, Placeholder)) {
				throw new ClickHouseInsertValueError(
					`Column "${fieldName}" of "${getTableName(table)}" was given a SQL expression, which a row `
						+ `format cannot carry. Insert this row through the statement path instead.`,
				);
			}

			row[this.casing.getColumnCasing(column)] = value === null ? null : column.mapToRowValue(value);
		}
		return row;
	}

	/**
	 * Renders one column's definition as it appears inside `CREATE TABLE`.
	 *
	 * Order matters to ClickHouse: `name Type [DEFAULT|MATERIALIZED|ALIAS|EPHEMERAL expr] [COMMENT]
	 * [CODEC] [TTL]`.
	 */
	buildColumnDefinition(column: ClickHouseColumn): SQL {
		const chunks: SQL[] = [
			sql`${sql.identifier(this.casing.getColumnCasing(column))} ${sql.raw(column.getSQLType())}`,
		];

		const computedKeyword = column.computedKeyword;
		if (computedKeyword !== undefined) {
			const generated = column.generated!;
			const expression = typeof generated.as === 'function' ? generated.as() : generated.as;
			chunks.push(sql`${sql.raw(computedKeyword)} ${expression as SQL}`);
		} else if (column.isEphemeral) {
			chunks.push(
				column.default === undefined
					? sql`EPHEMERAL`
					: sql`EPHEMERAL ${is(column.default, SQL) ? column.default : sql.param(column.default, column)}`,
			);
		} else if (column.default !== undefined) {
			chunks.push(sql`DEFAULT ${is(column.default, SQL) ? column.default : sql.param(column.default, column)}`);
		}

		if (column.comment !== undefined) {
			chunks.push(sql`COMMENT ${sql.raw(escapeClickHouseString(column.comment))}`);
		}

		const codec = column.codec;
		if (codec?.length) {
			chunks.push(
				sql`CODEC(${sql.join(codec.map((c) => (typeof c === 'string' ? sql.raw(c) : c)), sql`, `)})`,
			);
		}

		if (column.ttl !== undefined) {
			chunks.push(sql`TTL ${column.ttl}`);
		}

		return sql.join(chunks, sql` `);
	}

	/**
	 * Builds a `CREATE TABLE` statement for a table declared with {@link clickhouseTable}.
	 *
	 * Render it with `sqlToQuery(stmt, 'indexes')`: inside DDL, column references must be bare names
	 * rather than the `table`.`column` form used in queries.
	 */
	buildCreateTableQuery(
		table: ClickHouseTable,
		options: { ifNotExists?: boolean; onCluster?: string } = {},
	): SQL {
		const { columns, engine, indexes, projections } = getTableConfig(table);

		if (!engine) {
			throw new Error(
				`Table "${
					getTableName(table)
				}" does not declare an engine. Add one to the table's extra config, e.g. \`(t) => [mergeTree({ orderBy: t.id })]\`.`,
			);
		}

		const entries: SQL[] = [
			...columns.map((column) => this.buildColumnDefinition(column)),
			...indexes.map((index) => index.getSQL()),
			...projections.map((projection) => projection.getSQL()),
		];

		const ifNotExistsSql = options.ifNotExists ? sql`if not exists ` : undefined;
		const onClusterSql = options.onCluster
			? sql` on cluster ${sql.identifier(options.onCluster)}`
			: undefined;
		const clausesSql = engine.getClausesSQL();

		return sql`create table ${ifNotExistsSql}${table}${onClusterSql} (${
			sql.join(entries, sql`, `)
		}) ${engine.getEngineSQL()}${clausesSql ? sql` ${clausesSql}` : undefined}`;
	}

	/** Builds a `DROP TABLE` statement. */
	buildDropTableQuery(
		table: ClickHouseTable,
		options: { ifExists?: boolean; onCluster?: string; sync?: boolean } = {},
	): SQL {
		const ifExistsSql = options.ifExists ? sql`if exists ` : undefined;
		const onClusterSql = options.onCluster
			? sql` on cluster ${sql.identifier(options.onCluster)}`
			: undefined;
		// `SYNC` makes the drop wait for the data to actually be removed rather than returning early.
		const syncSql = options.sync ? sql` sync` : undefined;
		return sql`drop table ${ifExistsSql}${table}${onClusterSql}${syncSql}`;
	}

	sqlToQuery(sql: SQL, invokeSource?: 'indexes' | undefined): QueryWithTypings {
		return sql.toQuery({
			casing: this.casing,
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			// ClickHouse has no bind parameters; values are rendered as escaped literals instead.
			inlineParams: true,
			invokeSource,
		});
	}
}
