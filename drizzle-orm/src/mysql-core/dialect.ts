import { aliasedTable, getOriginalColumnFromAlias } from '~/alias.ts';
import { CodecsCollection } from '~/codecs.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	AnyOne,
	BuildRelationalQueryResult,
	DBQueryConfigWithComment,
	RelationalRowsMapperGenerator,
	TableRelationalConfig,
	TablesRelationalConfig,
	WithContainer,
} from '~/relations.ts';
import {
	// AggregatedField,
	getTableAsAliasSQL,
	makeDefaultRqbMapper,
	makeJitRqbMapper,
	relationExtrasToSQL,
	relationsFilterToSQL,
	relationsOrderToSQL,
	relationToSQL,
} from '~/relations.ts';
import { and } from '~/sql/expressions/index.ts';
import { isSQLWrapper, noopEncoder, Param, SQL, sql, StringChunk, View } from '~/sql/sql.ts';
import type { DriverValueEncoder, Name, Placeholder, Query, SQLChunk, SQLWrapper } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, Table, TableColumns } from '~/table.ts';
import {
	make$ReturningResponseMapper,
	makeDefaultQueryMapper,
	makeJitQueryMapper,
	orderSelectedFields,
	type RowsMapperGenerator,
	type UpdateSet,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { type MySqlCodecs, type MySqlType, resolveMySqlTypeAlias, unionsTypeTable } from './codecs.ts';
import { MySqlColumn } from './columns/common.ts';
import type { MySqlCustomColumn } from './columns/custom.ts';
import type { MySqlDeleteConfig } from './query-builders/delete.ts';
import type { MySqlInsertConfig } from './query-builders/insert.ts';
import type {
	AnyMySqlSelectQueryBuilder,
	MySqlSelectConfig,
	SelectedFieldsOrdered,
} from './query-builders/select.types.ts';
import type { MySqlUpdateConfig } from './query-builders/update.ts';
import { MySqlTable } from './table.ts';
import { MySqlViewBase } from './view-base.ts';
import type { MySqlView } from './view.ts';

export interface MySqlDialectConfig {
	escapeParam?: (num: number) => string;
	codecs?: MySqlCodecs;
	useJitMappers?: boolean;
	/** Resolves mysql binary protocol bug that rejects numbers in pagination */
	paginationToBigint?: boolean;
}

export class MySqlDialect {
	static readonly [entityKind]: string = 'MySqlDialect';

	readonly codecs: CodecsCollection<MySqlType>;
	readonly mapperGenerators: {
		rows: RowsMapperGenerator;
		relationalRows: RelationalRowsMapperGenerator;
		$returning: typeof make$ReturningResponseMapper; // TODO: jit ver
	};
	readonly paginationEncoder: DriverValueEncoder<any, any>;

	constructor(config?: MySqlDialectConfig) {
		if (config?.escapeParam) {
			this.escapeParam = config.escapeParam;
		}

		this.codecs = new CodecsCollection<MySqlType>(resolveMySqlTypeAlias, config?.codecs);
		this.mapperGenerators = config?.useJitMappers
			? {
				rows: makeJitQueryMapper,
				relationalRows: makeJitRqbMapper,
				$returning: make$ReturningResponseMapper,
			}
			: {
				rows: makeDefaultQueryMapper,
				relationalRows: makeDefaultRqbMapper,
				$returning: make$ReturningResponseMapper,
			};
		this.paginationEncoder = config?.paginationToBigint ? { mapToDriverValue: BigInt } : noopEncoder;
	}

	escapeName(name: string): string {
		return `\`${name.replace(/`/g, '``')}\``;
	}

	escapeParam(_num: number): string {
		return `?`;
	}

	escapeString(str: string): string {
		return `'${str.replace(/'/g, "''")}'`;
	}

	private buildWithCTE(queries: Subquery[] | undefined): SQL | undefined {
		if (!queries?.length) return undefined;

		const queriesLen = queries.length;
		const withSqlChunks: SQLChunk[] = new Array(queriesLen + 1);
		let writeIdx = 0;
		withSqlChunks[writeIdx++] = new StringChunk('with ');

		for (let i = 0; i < queriesLen; ++i) {
			const w = queries[i]!;
			withSqlChunks[writeIdx++] = (i < queriesLen - 1)
				? sql`${sql.identifier(w._.alias)} as (${w._.sql}), `
				: sql`${sql.identifier(w._.alias)} as (${w._.sql}) `;
		}

		return new SQL(withSqlChunks);
	}

	buildDeleteQuery({
		table,
		where,
		withList,
		limit,
		orderBy,
		comment,
	}: MySqlDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const limitSql = this.buildLimit(limit);

		return sql`${withSql}delete from ${table}${whereSql}${orderBySql}${limitSql}${
			comment !== undefined ? sql` ${comment}` : undefined
		}`;
	}

	buildUpdateSet(table: MySqlTable, set: UpdateSet): SQL {
		const tableColumns = table[Table.Symbol.Columns];

		const columnNames = Object.keys(tableColumns).filter(
			(colName) =>
				set[colName] !== undefined
				|| tableColumns[colName]?.onUpdateFn !== undefined,
		);

		const setLength = columnNames.length;
		const setArr: SQLChunk[] = new Array(setLength);

		for (let i = 0; i < columnNames.length; ++i) {
			const colName = columnNames[i]!;
			const col = tableColumns[colName]!;

			let value;
			if (set[colName] !== undefined) {
				value = set[colName];
			} else {
				const updateRes = col.onUpdateFn?.();
				value = is(updateRes, SQL) ? updateRes : sql.param(updateRes, col);
			}

			setArr[i] = i < setLength - 1
				? sql`${sql.identifier(col.name)} = ${value}, `
				: sql`${sql.identifier(col.name)} = ${value}`;
		}

		return new SQL(setArr);
	}

	buildUpdateQuery({
		table,
		set,
		where,
		withList,
		limit,
		orderBy,
		comment,
	}: MySqlUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const setSql = this.buildUpdateSet(table, set);

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const limitSql = this.buildLimit(limit);

		return sql`${withSql}update ${table} set ${setSql}${whereSql}${orderBySql}${limitSql}${
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
	 * If `isSingleTable` is true, then columns won't be prefixed with table name
	 */
	private buildSelection(
		fields: SelectedFieldsOrdered,
		{ isSingleTable = false, ignoreCastCodecs = false, table }: {
			isSingleTable?: boolean;
			ignoreCastCodecs?: boolean;
			table?: MySqlTable | MySqlViewBase | SQL | Subquery;
		} = {},
	): SQL {
		const { length: columnsLen } = fields;
		const chunks: SQLChunk[] = [];
		const tableName = table
			? is(table, SQL) || is(table, Subquery)
				? undefined
				: (table[Table.Symbol.IsAlias] || table[Table.Symbol.Schema] === undefined
					? table[Table.Symbol.Name]
					: `${table[Table.Symbol.Schema]}.${table[Table.Symbol.Name]}`)
			: undefined;

		for (let i = 0; i < columnsLen; ++i) {
			const { field, codecOverride, column, fieldType } = fields[i]!;
			const override = codecOverride as MySqlType | undefined;

			switch (fieldType) {
				case 'Column': {
					let name: Name | Column;
					if (isSingleTable) {
						name = field.isAlias
							? sql.identifier(getOriginalColumnFromAlias(field).name)
							: sql.identifier(field.name);
					} else {
						name = field.isAlias ? getOriginalColumnFromAlias(field) : field;
					}

					const casted = ignoreCastCodecs ? name : this.codecs.apply(field, 'cast', name, override);
					chunks.push(field.isAlias ? sql`${casted} as ${field}` : casted);

					break;
				}
				case 'SQL.Aliased': {
					if (field.isSelectionField) {
						const query = !isSingleTable && field.origin !== undefined
							? sql`${sql.identifier(field.origin)}.${sql.identifier(field.fieldAlias)}`
							: sql.identifier(field.fieldAlias);
						if (column && !ignoreCastCodecs) chunks.push(this.codecs.apply(column, 'cast', query, override));
						else chunks.push(query);
					} else {
						if (isSingleTable && tableName !== undefined) {
							const { queryChunks } = field.sql;
							const newChunks: SQLChunk[] = new Array(queryChunks.length);
							let abort = false;

							for (let i = 0; i < queryChunks.length; ++i) {
								const c = queryChunks[i]!;
								if (is(c, Column)) {
									const { table } = c;
									const columnTableName = table[Table.Symbol.IsAlias] || table[Table.Symbol.Schema] === undefined
										? table[Table.Symbol.Name]
										: `${table[Table.Symbol.Schema]}.${table[Table.Symbol.Name]}`;
									if (columnTableName !== tableName) {
										abort = true;
										break;
									}

									newChunks[i] = sql.identifier(c.name);
								} else {
									newChunks[i] = c;
								}
							}

							if (abort) {
								chunks.push(
									column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', field.sql, override) : field.sql,
								);
							} else {
								const newSql = new SQL(newChunks);

								if (field.sql.shouldInlineParams) newSql.inlineParams();
								chunks.push(
									column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', newSql, override) : newSql,
								);
							}
						} else {
							chunks.push(
								column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', field.sql, override) : field.sql,
							);
						}

						chunks.push(sql` as ${sql.identifier(field.fieldAlias)}`);
					}

					break;
				}
				case 'SQL': {
					if (isSingleTable && tableName !== undefined) {
						const { queryChunks } = field;
						const newChunks: SQLChunk[] = new Array(queryChunks.length);
						let abort = false;

						for (let i = 0; i < queryChunks.length; ++i) {
							const c = queryChunks[i]!;
							if (is(c, Column)) {
								const { table } = c;
								const columnTableName = table[Table.Symbol.IsAlias] || table[Table.Symbol.Schema] === undefined
									? table[Table.Symbol.Name]
									: `${table[Table.Symbol.Schema]}.${table[Table.Symbol.Name]}`;
								if (columnTableName !== tableName) {
									abort = true;
									break;
								}

								newChunks[i] = sql.identifier(c.name);
							} else {
								newChunks[i] = c;
							}
						}

						if (abort) {
							chunks.push(column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', field, override) : field);
						} else {
							const newSql = new SQL(newChunks);
							if (field.shouldInlineParams) newSql.inlineParams();
							chunks.push(column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', newSql, override) : newSql);
						}
					} else chunks.push(column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', field, override) : field);

					break;
				}
				case 'Subquery': {
					if (column && !ignoreCastCodecs && !field._.isWith) {
						const innerCasted = this.codecs.apply(column, 'cast', sql`(${field._.sql})`, override);
						chunks.push(sql`${innerCasted} ${sql.identifier(field._.alias)}`);
					} else {
						chunks.push(column ? this.codecs.apply(column, 'cast', field) : field, override);
					}

					break;
				}
			}

			if (i < columnsLen - 1) {
				chunks.push(new StringChunk(', '));
			}
		}

		return new SQL(chunks);
	}

	private buildLimit(limit: number | Placeholder | undefined): SQL | undefined {
		return typeof limit === 'object'
				|| (typeof limit === 'number' && limit >= 0)
			// Binary protocol bug bypass
			? sql` limit ${sql.param(limit, this.paginationEncoder)}`
			: undefined;
	}

	private buildOrderBy(
		orderBy: (MySqlColumn | SQL | SQL.Aliased)[] | undefined,
	): SQL | undefined {
		return orderBy && orderBy.length > 0
			? sql` order by ${sql.join(orderBy, new StringChunk(', '))}`
			: undefined;
	}

	private buildIndex({
		indexes,
		indexFor,
	}: {
		indexes: string[] | undefined;
		indexFor: 'USE' | 'FORCE' | 'IGNORE';
	}): SQL | undefined {
		return indexes && indexes.length > 0
			? sql` ${new StringChunk(indexFor)} INDEX ${indexes.map((it) => sql.identifier(it))}`
			: undefined;
	}

	buildSelectQuery({
		withList,
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
		useIndex,
		forceIndex,
		ignoreIndex,
		comment,
		ignoreSelectionCastCodecs,
	}: MySqlSelectConfig): SQL {
		if (!fieldsFlat) {
			throw new Error('Select query builder must be provided with `fieldsFlat` on `buildSelectQuery` invocation');
		}
		const fieldsList = fieldsFlat;
		for (const f of fieldsList) {
			if (
				is(f.field, Column)
				&& getTableName(f.field.table)
					!== (is(table, Subquery)
						? table._.alias
						: is(table, MySqlViewBase)
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

		const selection = this.buildSelection(fieldsList, {
			isSingleTable,
			ignoreCastCodecs: ignoreSelectionCastCodecs || setOperators.length > 0,
			table,
		});

		const tableSql = (() => {
			if (is(table, Table) && table[Table.Symbol.IsAlias]) {
				return sql`${table[Table.Symbol.Schema] ? sql`${sql.identifier(table[Table.Symbol.Schema]!)}.` : undefined}${
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
		})();

		const joinsArray: SQLChunk[] = [];

		if (joins) {
			for (const [index, joinMeta] of joins.entries()) {
				if (index === 0) {
					joinsArray.push(new StringChunk(' '));
				}
				const table = joinMeta.table;
				const lateralSql = joinMeta.lateral ? sql` lateral` : undefined;
				const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : undefined;

				if (is(table, MySqlTable)) {
					const tableName = table[MySqlTable.Symbol.Name];
					const tableSchema = table[MySqlTable.Symbol.Schema];
					const origTableName = table[MySqlTable.Symbol.OriginalName];
					const alias = tableName === origTableName ? undefined : joinMeta.alias;
					const useIndexSql = this.buildIndex({
						indexes: joinMeta.useIndex,
						indexFor: 'USE',
					});
					const forceIndexSql = this.buildIndex({
						indexes: joinMeta.forceIndex,
						indexFor: 'FORCE',
					});
					const ignoreIndexSql = this.buildIndex({
						indexes: joinMeta.ignoreIndex,
						indexFor: 'IGNORE',
					});
					joinsArray.push(
						sql`${new StringChunk(joinMeta.joinType)} join${lateralSql} ${
							tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined
						}${sql.identifier(origTableName)}${useIndexSql}${forceIndexSql}${ignoreIndexSql}${
							alias && sql` ${sql.identifier(alias)}`
						}${onSql}`,
					);
				} else if (is(table, View)) {
					const viewName = table[ViewBaseConfig].name;
					const viewSchema = table[ViewBaseConfig].schema;
					const origViewName = table[ViewBaseConfig].originalName;
					const alias = viewName === origViewName ? undefined : joinMeta.alias;
					joinsArray.push(
						sql`${new StringChunk(joinMeta.joinType)} join${lateralSql} ${
							viewSchema ? sql`${sql.identifier(viewSchema)}.` : undefined
						}${sql.identifier(origViewName)}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
					);
				} else {
					joinsArray.push(
						sql`${new StringChunk(joinMeta.joinType)} join${lateralSql} ${table}${onSql}`,
					);
				}
				if (index < joins.length - 1) {
					joinsArray.push(new StringChunk(' '));
				}
			}
		}

		const joinsSql = new SQL(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const groupBySql = groupBy && groupBy.length > 0
			? sql` group by ${sql.join(groupBy, new StringChunk(', '))}`
			: undefined;

		const limitSql = this.buildLimit(limit);

		// Binary protocol bug bypass
		const offsetSql = offset
			? sql` offset ${sql.param(offset, this.paginationEncoder)}`
			: undefined;

		const useIndexSql = this.buildIndex({ indexes: useIndex, indexFor: 'USE' });

		const forceIndexSql = this.buildIndex({
			indexes: forceIndex,
			indexFor: 'FORCE',
		});

		const ignoreIndexSql = this.buildIndex({
			indexes: ignoreIndex,
			indexFor: 'IGNORE',
		});

		let lockingClausesSql;
		if (lockingClause) {
			const { config, strength } = lockingClause;
			lockingClausesSql = sql` for ${new StringChunk(strength)}`;
			if (config.noWait) {
				lockingClausesSql.append(sql` nowait`);
			} else if (config.skipLocked) {
				lockingClausesSql.append(sql` skip locked`);
			}
		}

		const finalQuery =
			sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${useIndexSql}${forceIndexSql}${ignoreIndexSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}${lockingClausesSql}${
				comment !== undefined ? sql` ${comment}` : undefined
			}`;

		if (setOperators.length > 0) {
			return this.buildSetOperations(finalQuery, fieldsList, ignoreSelectionCastCodecs, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		leftSelection: SelectedFieldsOrdered,
		ignoreSelectionCastCodecs: boolean | undefined,
		setOperators: MySqlSelectConfig['setOperators'],
	): SQL {
		const outputSelection = leftSelection;
		for (let i = 0; i < setOperators.length; ++i) {
			const setOperator = setOperators[i];
			if (!setOperator) {
				throw new Error('Cannot pass undefined values to any set operator');
			}

			leftSelect = this.buildSetOperationQuery({ leftSelect, setOperator });
			const rightSelection = orderSelectedFields(setOperator.rightSelect.getSelectedFields());
			for (let j = 0; j < outputSelection.length; ++j) {
				const l = outputSelection[j]!;
				const lPath = l.path.join('.');
				const r = rightSelection.find((e) => e.path.join('.') === lPath)!; // Equivalency of selections is a pre-requisite for unions

				const lc = l.codecOverride ?? l.column?.codec;
				const rc = r.codecOverride ?? r.column?.codec;

				outputSelection[j]!.codecOverride = (lc && rc)
					? unionsTypeTable[lc as any as keyof typeof unionsTypeTable]?.[rc as any as keyof typeof unionsTypeTable]
					: lc;
			}
		}

		for (let i = 0; i < outputSelection.length; ++i) {
			const out = outputSelection[i]!;
			out.codec = out.codecOverride
				? this.codecs.get(out.column!, 'normalize', out.codecOverride as MySqlType)
				: out.codec;
		}

		return ignoreSelectionCastCodecs ? leftSelect : sql`select ${
			this.buildSelection(
				outputSelection.map((field) => {
					if (field.fieldType === 'SQL.Aliased') {
						const ref = field.field.clone();
						ref.isSelectionField = true;
						return { ...field, field: ref, fieldType: 'SQL.Aliased' };
					}
					if (field.fieldType === 'Column' && field.field.isAlias) {
						const ref = new SQL.Aliased(sql`${sql.identifier(field.field.name)}`, field.field.name);
						ref.isSelectionField = true;
						return { ...field, field: ref, fieldType: 'SQL.Aliased' };
					}
					if (field.fieldType === 'Subquery') {
						const ref = new SQL.Aliased(sql`${field.field.getSQL()}`, field.field._.alias);
						ref.isSelectionField = true;
						return { ...field, field: ref, fieldType: 'SQL.Aliased' };
					}
					return field;
				}),
				{
					isSingleTable: true,
					ignoreCastCodecs: ignoreSelectionCastCodecs,
				},
			)
		} from (${leftSelect}) ${sql.identifier('drizzle_union')}`;
	}

	buildSetOperationQuery({
		leftSelect,
		setOperator: { type, isAll, rightSelect, limit, orderBy, offset },
	}: {
		leftSelect: SQL;
		setOperator: MySqlSelectConfig['setOperators'][number];
	}): SQL {
		const leftChunk = sql`(${leftSelect.getSQL()}) `;
		const rightChunk = sql`(${rightSelect.withoutSelectionCastCodecs().getSQL()})`;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: (SQL<unknown> | Name)[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid MySql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const orderByUnit of orderBy) {
				if (is(orderByUnit, MySqlColumn)) {
					orderByValues.push(
						sql.identifier(orderByUnit.name),
					);
				} else if (is(orderByUnit, SQL)) {
					for (let i = 0; i < orderByUnit.queryChunks.length; i++) {
						const chunk = orderByUnit.queryChunks[i];

						if (is(chunk, MySqlColumn)) {
							orderByUnit.queryChunks[i] = sql.identifier(chunk.name);
						}
					}

					orderByValues.push(sql`${orderByUnit}`);
				} else {
					orderByValues.push(sql`${orderByUnit}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, new StringChunk(', '))} `;
		}

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const operatorChunk = new StringChunk(`${type} ${isAll ? 'all ' : ''}`);

		// Binary protocol bug bypass
		const offsetSql = offset
			? sql` offset ${sql.param(offset, this.paginationEncoder)}`
			: undefined;

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery({
		table,
		values: valuesOrSelect,
		ignore,
		onConflict,
		select,
		columnList,
		comment,
	}: MySqlInsertConfig): { sql: SQL; generatedIds: Record<string, unknown>[] } {
		// const isSingleValue = values.length === 1;
		const columns: Record<string, MySqlColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, MySqlColumn][] = columnList
			? columnList.map((name) => [name, columns[name]!])
			: Object.entries(columns);
		const colEntriesFiltered: [string, MySqlColumn][] = select && !is(valuesOrSelect, SQL)
			? Object
				.keys((valuesOrSelect as TypedQueryBuilder<any>).getSelectedFields())
				.map((key) => [key, columns[key]] as [string, MySqlColumn])
			: colEntries.filter(([_, col]) => !col.shouldDisableInsert());

		const insertOrderArr: SQLChunk[] = new Array(colEntriesFiltered.length * 2 + 1);
		let writeIdx = 0;
		insertOrderArr[writeIdx++] = new StringChunk('(');
		for (let i = 0; i < colEntriesFiltered.length; ++i) {
			const [, { name }] = colEntriesFiltered[i]!;
			insertOrderArr[writeIdx++] = sql.identifier(name);

			if (i < colEntriesFiltered.length - 1) insertOrderArr[writeIdx++] = new StringChunk(', ');
		}
		insertOrderArr[writeIdx++] = new StringChunk(')');
		const insertOrder = new SQL(insertOrderArr);
		const generatedIdsResponse: Record<string, unknown>[] = [];

		const valuesSqlList: SQLChunk[] = Array.from({
			length: select
				? 1
				: (colEntriesFiltered.length * 2 + 1) * (valuesOrSelect as Record<string, unknown>[]).length
					+ (valuesOrSelect as Record<string, unknown>[]).length,
		});

		if (select) {
			valuesSqlList[0] = (valuesOrSelect as AnyMySqlSelectQueryBuilder | SQL).getSQL();
		} else {
			const values = valuesOrSelect as Record<string, unknown>[];

			let writeIdx = 0;
			valuesSqlList[writeIdx++] = new StringChunk('values ');

			for (let valueIndex = 0; valueIndex < values.length; ++valueIndex) {
				const value = values[valueIndex]!;
				const generatedIds: Record<string, unknown> = {};

				valuesSqlList[writeIdx++] = new StringChunk('(');
				for (let i = 0; i < colEntriesFiltered.length; ++i) {
					const [fieldName, col] = colEntriesFiltered[i]!;
					const colValue = value[fieldName];
					if (colValue === undefined) {
						// eslint-disable-next-line unicorn/no-negated-condition
						if (col.defaultFn !== undefined) {
							const defaultFnResult = col.defaultFn();
							generatedIds[fieldName] = defaultFnResult;
							const defaultValue = is(defaultFnResult, SQL)
								? defaultFnResult
								: sql.param(defaultFnResult, col);
							valuesSqlList[writeIdx++] = defaultValue;
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (!col.default && col.onUpdateFn !== undefined) {
							const onUpdateFnResult = col.onUpdateFn();
							const newValue = is(onUpdateFnResult, SQL)
								? onUpdateFnResult
								: sql.param(onUpdateFnResult, col);
							valuesSqlList[writeIdx++] = newValue;
						} else {
							valuesSqlList[writeIdx++] = new StringChunk(`default`);
						}
					} else if (is(colValue, SQL)) {
						valuesSqlList[writeIdx++] = colValue;
					} else {
						if (col.defaultFn) {
							generatedIds[fieldName] = colValue;
						}
						valuesSqlList[writeIdx++] = new Param(colValue, col);
					}

					if (i < colEntriesFiltered.length - 1) {
						valuesSqlList[writeIdx++] = new StringChunk(', ');
					}
				}

				generatedIdsResponse.push(generatedIds);

				valuesSqlList[writeIdx++] = new StringChunk(')');

				if (valueIndex < values.length - 1) {
					valuesSqlList[writeIdx++] = new StringChunk(`, `);
				}
			}
		}

		const valuesSql = new SQL(valuesSqlList);

		const ignoreSql = ignore ? sql` ignore` : undefined;

		const onConflictSql = onConflict
			? sql` on duplicate key ${onConflict}`
			: undefined;

		return {
			sql: sql`insert${ignoreSql} into ${table} ${insertOrder} ${valuesSql}${onConflictSql}${
				comment !== undefined ? sql` ${comment}` : undefined
			}`,
			generatedIds: generatedIdsResponse,
		};
	}

	sqlToQuery(sql: SQL, invokeSource?: 'indexes' | undefined): Query {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			codecs: this.codecs,
			invokeSource,
		});
	}

	private buildRqbColumn(
		table: Table | View,
		field: unknown,
		key: string,
		inJson: boolean,
		selection: BuildRelationalQueryResult['selection'],
		tableTsName: string,
	) {
		let decoderColumn: Column | undefined;
		let fieldType: BuildRelationalQueryResult['selection'][number]['fieldType'];
		let output: SQL;

		if (is(field, Column)) {
			decoderColumn = field;
			fieldType = 'Column';

			const name = sql`${table}.${sql.identifier(field.name)}`;
			const casted = inJson && (<MySqlCustomColumn<any>> field).jsonSelectIdentifier
				? (<MySqlCustomColumn<any>> field).jsonSelectIdentifier!(name, sql)
				: this.codecs.apply(field, inJson ? 'castInJson' : 'cast', name);

			output = sql`${casted} as ${sql.identifier(key)}`;
		} else if (is(field, SQL)) {
			decoderColumn = is(field.decoder, Column) ? field.decoder : undefined;
			fieldType = 'SQL';

			const q = sql`${table}.${sql.identifier(key)}`;
			output = sql`${decoderColumn ? this.codecs.apply(decoderColumn, inJson ? 'castInJson' : 'cast', q) : q} as ${
				sql.identifier(key)
			}`;
		} else if (is(field, SQL.Aliased)) {
			decoderColumn = is(field.sql.decoder, Column) ? field.sql.decoder : undefined;
			fieldType = 'SQL.Aliased';

			const q = sql`${table}.${sql.identifier(field.fieldAlias)}`;
			output = sql`${decoderColumn ? this.codecs.apply(decoderColumn, inJson ? 'castInJson' : 'cast', q) : q} as ${
				sql.identifier(key)
			}`;
		} else if (isSQLWrapper(field)) {
			const query = (field as SQLWrapper).getSQL();
			decoderColumn = is(query.decoder, Column) ? query.decoder : undefined;
			fieldType = 'SQLWrapper';

			const q = sql`${table}.${sql.identifier(key)}`;
			output = sql`${decoderColumn ? this.codecs.apply(decoderColumn, inJson ? 'castInJson' : 'cast', q) : q} as ${
				sql.identifier(key)
			}`;
		} else {
			throw new DrizzleError({
				message: field === undefined
					? `Unknown column: "${tableTsName}"."${key}"`
					: `Views with nested selections are not supported by the relational query builder`,
			});
		}

		selection.push(
			(decoderColumn
				? {
					key,
					field,
					fieldType,
					codec: decoderColumn && (!inJson || !(<MySqlCustomColumn<any>> decoderColumn).mapFromJsonValue)
						? this.codecs.get(decoderColumn, inJson ? 'normalizeInJson' : 'normalize')
						: undefined,
				}
				: {
					key,
					field,
					fieldType,
				}) as BuildRelationalQueryResult['selection'][number],
		);

		return output;
	}

	private buildColumns = (
		table: Table | View,
		selection: BuildRelationalQueryResult['selection'],
		inJson: boolean,
		tableTsName: string,
		config?: DBQueryConfigWithComment<'many'>,
	) => {
		if (!config?.columns) {
			return sql.join(
				Object.entries(table[TableColumns]).map(([k, v]) => {
					return this.buildRqbColumn(table, v, k, inJson, selection, tableTsName);
				}),
				new StringChunk(', '),
			);
		}

		const entries = Object.entries(config.columns);
		const columnContainer: Record<string, unknown> = table[TableColumns];

		const columnIdentifiers: SQL[] = [];
		let colSelectionMode: boolean | undefined;
		for (const [k, v] of entries) {
			if (v === undefined) continue;
			colSelectionMode = colSelectionMode || v;

			if (v) {
				columnIdentifiers.push(this.buildRqbColumn(table, columnContainer[k]!, k, inJson, selection, tableTsName));
			}
		}

		if (colSelectionMode === false) {
			for (const [k, v] of Object.entries(columnContainer)) {
				if (config.columns[k] === false) continue;
				columnIdentifiers.push(this.buildRqbColumn(table, v, k, inJson, selection, tableTsName));
			}
		}

		return columnIdentifiers.length
			? sql.join(columnIdentifiers, new StringChunk(', '))
			: undefined;
	};

	buildRelationalQuery({
		schema,
		table,
		tableConfig,
		queryConfig: config,
		relationWhere,
		mode,
		errorPath,
		depth,
		isNestedMany,
		throughJoin,
		nested,
	}: {
		schema: TablesRelationalConfig;
		table: MySqlTable | MySqlView;
		tableConfig: TableRelationalConfig;
		queryConfig?: DBQueryConfigWithComment<'many'> | true;
		relationWhere?: SQL;
		mode: 'first' | 'many';
		errorPath?: string;
		depth?: number;
		isNestedMany?: boolean;
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

		const columns = this.buildColumns(table, selection, !!nested, tableConfig.name, params);

		const where: SQL | undefined = params && 'where' in params && relationWhere
			? and(
				relationsFilterToSQL(
					table,
					params.where,
					tableConfig.relations,
					schema,
				),
				relationWhere,
			)
			: params && 'where' in params
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
			? relationExtrasToSQL(table, params.extras, this.codecs, nested)
			: undefined;
		if (extras) selection.push(...extras.selection);

		const selectionArr: SQL[] = columns ? [columns] : [];
		if (extras?.sql) selectionArr.push(extras.sql);

		let joins: SQL | undefined;
		switch (params) {
			case undefined:
				break;
			default: {
				const { with: withParam } = params as WithContainer;
				if (!withParam) break;

				const withEntries = Object.entries(withParam).filter(([_, v]) => v);
				if (!withEntries.length) break;

				const joinChunks: SQLChunk[] = new Array(withEntries.length * 2);
				joinChunks[0] = new StringChunk(' ');

				for (let readIdx = 0, writeIdx = 1; readIdx < withEntries.length; ++readIdx) {
					const [k, join] = withEntries[readIdx]!;

					selectionArr.push(
						sql`${sql.identifier(k)}.${sql.identifier('r')} as ${sql.identifier(k)}`,
					);

					const relation = tableConfig.relations[k];
					if (!relation) throw new DrizzleError({ message: `Unknown relation "${tableConfig.name}" -> "${k}"` });
					const isSingle = relation.relationType === 'one';
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
						table: targetTable as MySqlTable,
						mode: isSingle ? 'first' : 'many',
						schema,
						queryConfig: join as DBQueryConfigWithComment,
						tableConfig: schema[relation.targetTableName]!,
						relationWhere: filter,
						errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
						depth: currentDepth + 1,
						isNestedMany: !isSingle,
						throughJoin,
						nested: true,
					});

					selection.push({
						field: targetTable,
						fieldType: 'Nested',
						key: k,
						selection: innerQuery.selection,
						isArray: !isSingle,
						isOptional: ((relation as AnyOne).optional ?? false)
							|| (join !== true
								&& !!(join as Exclude<typeof join, boolean | undefined>)
									.where),
					});

					const jsonColumns = sql.join(
						innerQuery.selection.map(
							(s) => sql`${new StringChunk(this.escapeString(s.key))}, ${sql.identifier(s.key)}`,
						),
						new StringChunk(', '),
					);

					const joinQuery = sql`left join lateral(select ${sql`${
						isSingle
							? sql`json_object(${jsonColumns})`
							: sql`coalesce(json_arrayagg(json_object(${jsonColumns})), json_array())`
					} as ${sql.identifier('r')}`} from (${innerQuery.sql}) as ${sql.identifier('t')}) as ${
						sql.identifier(
							k,
						)
					} on true`;

					joinChunks[writeIdx++] = joinQuery;
					if (readIdx < withEntries.length - 1) joinChunks[writeIdx++] = new StringChunk(' ');
				}

				joins = new SQL(joinChunks);

				break;
			}
		}

		if (!selectionArr.length) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}
		// json_arrayagg() ignores order by clause otherwise
		if (isNestedMany && order) {
			selectionArr.push(sql`row_number() over (order by ${order})`);
		}
		const selectionSet = sql.join(selectionArr, new StringChunk(', '));
		const comment = config !== true && config?.comment
			? sql.comment(config.comment)
			: undefined;

		const query = sql`select ${selectionSet} from ${getTableAsAliasSQL(table)}${throughJoin}${joins}${
			where ? sql` where ${where}` : undefined
		}${order ? sql` order by ${order}` : undefined}${
			limit !== undefined ? sql` limit ${sql.param(limit, this.paginationEncoder)}` : undefined
		}${
			offset !== undefined
				? sql` offset ${sql.param(offset, this.paginationEncoder)}`
				: undefined
		}${comment ? sql` ${comment}` : undefined}`;

		return {
			sql: query,
			selection,
		};
	}
}
