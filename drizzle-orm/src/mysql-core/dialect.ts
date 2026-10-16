import { aliasedTable, getOriginalColumnFromAlias } from '~/alias.ts';
import { CodecsCollection } from '~/codecs.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	AnyOne,
	BuildRelationalQueryConfig,
	BuildRelationalQueryResult,
	DBQueryConfigWithComment,
	RelationalRowsMapperGenerator,
	WithContainer,
} from '~/relations.ts';
import {
	buildRqbColumns,
	// AggregatedField,
	collectRelationalSubquery,
	getTableAsAliasSQL,
	makeDefaultRqbMapper,
	makeJitRqbMapper,
	relationalQueryWhereToSQL,
	type RelationalWithSubqueries,
	relationExtrasToSQL,
	relationsOrderToSQL,
	relationToSQL,
} from '~/relations.ts';
import { commonStringChunks, StringChunk } from '~/sql/common-chunks.ts';
import { noopEncoder, SQL, sql } from '~/sql/sql.ts';
import type { DriverValueEncoder, Name, Placeholder, Query, SQLChunk } from '~/sql/sql.ts';
import { chunkKindOf, chunkKinds, isChunk } from '~/sql/sql.ts';
import { ValueRows } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { getTableName, Table, TableColumns } from '~/table.ts';
import {
	make$ReturningResponseMapper,
	makeDefaultQueryMapper,
	makeJitQueryMapper,
	memoizeEscape,
	orderSelectedFields,
	type RowsMapperGenerator,
	type UpdateSet,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { View } from '~/view.ts';
import { type MySqlCodecs, type MySqlType, resolveMySqlTypeAlias, unionsTypeTable } from './codecs.ts';
import { MySqlColumn } from './columns/common.ts';
import type { MySqlDeleteConfig } from './query-builders/delete.ts';
import type { MySqlInsertConfig } from './query-builders/insert.ts';
import type {
	AnyMySqlSelectQueryBuilder,
	MySqlSelectConfig,
	SelectedFieldsOrdered,
} from './query-builders/select.types.ts';
import type { MySqlUpdateConfig } from './query-builders/update.ts';
import { MySqlTable } from './table.ts';
import type { MySqlViewBase } from './view-base.ts';

export interface MySqlDialectConfig {
	escapeParam?: (num: number) => string;
	codecs?: MySqlCodecs;
	useJitMappers?: boolean;
	/** Resolves mysql binary protocol bug that rejects numbers in pagination */
	paginationToBigint?: boolean;
}

const escapeMySqlName = memoizeEscape((name) => `\`${name.replace(/`/g, '``')}\``);
// Stored separately - differ per dialect
const rqbChunks = {
	relationField: new StringChunk('.`r` as '),
	rowNumber: new StringChunk(', row_number() over (order by '),
	joinOpen: new StringChunk(' left join lateral(select '),
	joinFrom: new StringChunk(' as `r` from ('),
	joinClose: new StringChunk(') as `t`) as '),
	onTrue: new StringChunk(' on true'),
	jsonObjectOpen: new StringChunk('json_object('),
	jsonArrayAggOpen: new StringChunk('coalesce(json_arrayagg(json_object('),
	jsonArrayAggClose: new StringChunk(')), json_array())'),
} as const;

export interface MySqlBuildRelationalQueryConfig extends BuildRelationalQueryConfig {
	isNestedMany?: boolean;
}

export class MySqlDialect {
	static readonly [entityKind]: string = 'MySqlDialect';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

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
		return escapeMySqlName(name);
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
		withSqlChunks[writeIdx++] = commonStringChunks['with '];

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
		const tableKind = chunkKindOf(table);
		const tableName = table
			? isChunk(table, tableKind, chunkKinds.sql) || isChunk(table, tableKind, chunkKinds.subquery)
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
					if (!field._.isWith) {
						const inner = sql`(${field._.sql})`;
						chunks.push(
							sql`${column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', inner, override) : inner} ${
								sql.identifier(field._.alias)
							}`,
						);
					} else {
						chunks.push(column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', field, override) : field);
					}

					break;
				}
			}

			if (i < columnsLen - 1) {
				chunks.push(commonStringChunks[', ']);
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
			? sql` order by ${sql.join(orderBy, commonStringChunks[', '])}`
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
		useSelectionCastCodecs,
	}: MySqlSelectConfig): SQL {
		if (!fieldsFlat) {
			throw new Error('Select query builder must be provided with `fieldsFlat` on `buildSelectQuery` invocation');
		}
		const fieldsList = fieldsFlat;

		const tableKind = chunkKindOf(table);
		const ownTableName = isChunk(table, tableKind, chunkKinds.subquery)
			? table._.alias
			: isChunk(table, tableKind, chunkKinds.view)
			? table[ViewBaseConfig].name
			: isChunk(table, tableKind, chunkKinds.sql)
			? undefined
			: getTableName(table);
		for (const f of fieldsList) {
			if (
				is(f.field, Column)
				&& getTableName(f.field.table) !== ownTableName
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
			ignoreCastCodecs: !useSelectionCastCodecs || setOperators.length > 0,
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
					joinsArray.push(commonStringChunks[' ']);
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
					joinsArray.push(commonStringChunks[' ']);
				}
			}
		}

		const joinsSql = new SQL(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const groupBySql = groupBy && groupBy.length > 0
			? sql` group by ${sql.join(groupBy, commonStringChunks[', '])}`
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
			return this.buildSetOperations(finalQuery, fieldsList, useSelectionCastCodecs, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		leftSelection: SelectedFieldsOrdered,
		useSelectionCastCodecs: boolean | undefined,
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

		return !useSelectionCastCodecs ? leftSelect : sql`select ${
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
					ignoreCastCodecs: !useSelectionCastCodecs,
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
		const rightChunk = sql`(${rightSelect.getSQL()})`;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: (SQL<unknown> | Name)[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid Sql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const singleOrderBy of orderBy) {
				if (is(singleOrderBy, MySqlColumn)) {
					orderByValues.push(sql.identifier(singleOrderBy.name));
				} else if (is(singleOrderBy, SQL)) {
					for (let i = 0; i < singleOrderBy.queryChunks.length; i++) {
						const chunk = singleOrderBy.queryChunks[i];

						if (is(chunk, MySqlColumn)) {
							singleOrderBy.queryChunks[i] = sql.identifier(chunk.name);
						}
					}

					orderByValues.push(sql`${singleOrderBy}`);
				} else {
					orderByValues.push(sql`${singleOrderBy}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, commonStringChunks[', '])}`;
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
		insertOrderArr[writeIdx++] = commonStringChunks['('];
		for (let i = 0; i < colEntriesFiltered.length; ++i) {
			const [, { name }] = colEntriesFiltered[i]!;
			insertOrderArr[writeIdx++] = sql.identifier(name);

			if (i < colEntriesFiltered.length - 1) insertOrderArr[writeIdx++] = commonStringChunks[', '];
		}
		insertOrderArr[writeIdx++] = commonStringChunks[')'];
		const insertOrder = new SQL(insertOrderArr);
		const generatedIdsResponse: Record<string, unknown>[] = [];

		let valuesSqlList: SQLChunk[];

		if (select) {
			valuesSqlList = [(valuesOrSelect as AnyMySqlSelectQueryBuilder | SQL).getSQL()];
		} else {
			const values = valuesOrSelect as Record<string, unknown>[];
			const cells: unknown[] = new Array(values.length * colEntriesFiltered.length);

			let writeIdx = 0;

			for (let valueIndex = 0; valueIndex < values.length; ++valueIndex) {
				const value = values[valueIndex]!;
				const generatedIds: Record<string, unknown> = {};

				for (let i = 0; i < colEntriesFiltered.length; ++i) {
					const [fieldName, col] = colEntriesFiltered[i]!;
					const colValue = value[fieldName];
					if (colValue === undefined) {
						// eslint-disable-next-line unicorn/no-negated-condition
						if (col.defaultFn !== undefined) {
							const defaultFnResult = col.defaultFn();
							generatedIds[fieldName] = defaultFnResult;
							cells[writeIdx++] = defaultFnResult;
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (!col.default && col.onUpdateFn !== undefined) {
							cells[writeIdx++] = col.onUpdateFn();
						} else {
							cells[writeIdx++] = commonStringChunks['default'];
						}
					} else if (is(colValue, SQL)) {
						cells[writeIdx++] = colValue;
					} else {
						if (col.defaultFn) {
							generatedIds[fieldName] = colValue;
						}
						cells[writeIdx++] = colValue;
					}
				}

				generatedIdsResponse.push(generatedIds);
			}

			valuesSqlList = [commonStringChunks['values '], new ValueRows(cells, colEntriesFiltered.map(([, col]) => col))];
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

	buildRelationalQuery(
		config: Omit<MySqlBuildRelationalQueryConfig, 'through'>,
	): BuildRelationalQueryResult {
		const chunks: SQLChunk[] = [];
		const selection = this.collectRelationalQuery(config, chunks);

		return {
			sql: new SQL(chunks),
			selection,
		};
	}

	private collectRelationalQuery({
		schema,
		table,
		tableConfig,
		queryConfig: config,
		relationWhere,
		mode,
		errorPath,
		depth,
		isNestedMany,
		through,
		nested,
		withSubqueries,
		strategy,
	}: MySqlBuildRelationalQueryConfig, collectTo: SQLChunk[]): BuildRelationalQueryResult['selection'] {
		const selection: BuildRelationalQueryResult['selection'] = [];
		const isSingle = mode === 'first';
		const params = config === true ? undefined : config;
		const currentPath = errorPath ?? '';
		const currentDepth = depth ?? 0;
		const isOptimized = (currentDepth ? strategy : params?.strategy) !== 'basic';
		const subqueries: RelationalWithSubqueries = withSubqueries ?? new Map();
		if (!currentDepth) {
			collectRelationalSubquery(subqueries, table);
			table = aliasedTable(table, `d${currentDepth}`);
		}

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

		const { sql: where, hasRelationFilters } = relationalQueryWhereToSQL(
			table,
			params,
			tableConfig.relations,
			schema,
			subqueries,
			relationWhere,
		);
		const order = params?.orderBy
			? relationsOrderToSQL(table, params.orderBy, tableConfig.relations, schema, subqueries)
			: undefined;

		const withParam = params ? (params as WithContainer).with : undefined;
		const withKeys: string[] = [];
		if (withParam) {
			for (const key of Object.keys(withParam)) {
				if (withParam[key]) withKeys.push(key);
			}
		}

		// Reserved for `with` clause, filled once all subqueries are collected
		const withIdx = currentDepth ? -1 : collectTo.length;
		if (!currentDepth) collectTo.push(undefined);

		collectTo.push(commonStringChunks['select ']);
		const hasColumns = buildRqbColumns(
			table,
			tableConfig.table[TableColumns],
			selection,
			!!nested,
			tableConfig.name,
			this.codecs,
			collectTo,
			params?.columns,
		);
		let selected = hasColumns ? 1 : 0;
		if (params?.extras) {
			const mark = collectTo.length;
			if (selected) collectTo.push(commonStringChunks[', ']);
			const extras = relationExtrasToSQL(table, params.extras, this.codecs, nested, collectTo);
			selection.push(...extras.selection);
			if (extras.sql) ++selected;
			else collectTo.length = mark;
		}
		for (const k of withKeys) {
			const key = sql.identifier(k);
			if (selected++) collectTo.push(commonStringChunks[', ']);
			collectTo.push(key, rqbChunks.relationField, key);
		}

		if (!selected) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}
		// json_arrayagg() ignores order by clause otherwise
		if (isNestedMany && order) {
			collectTo.push(rqbChunks.rowNumber, ...order, commonStringChunks[')']);
		}

		// Optimize slow queries caused by planner applying pagination or filters after building relations
		// MySQL doesn't push `order by ... limit ... offset` below lateral joins: whenever the rows have to be sorted
		// or skipped, every joined relation gets built for each of those rows instead of just the returned ones.
		// Limiting the table in a derived table first restricts the joins to the rows that are actually returned.
		// Unordered `offset` isn't handled for tables filtered by relations: MySQL may plan such limited table
		// on its own noticeably worse than it does as a part of the whole query
		const isWrapped = withKeys.length > 0 && isOptimized && limit !== undefined
			&& (!!order || (offset !== undefined && !hasRelationFilters));

		collectTo.push(commonStringChunks[' from ']);
		if (isWrapped) collectTo.push(commonStringChunks['(select '], table, commonStringChunks['.* from ']);
		getTableAsAliasSQL(table, collectTo);
		if (through) {
			collectTo.push(commonStringChunks[' inner join ']);
			getTableAsAliasSQL(through.table, collectTo);
			collectTo.push(commonStringChunks[' on '], ...through.condition);
		}
		if (isWrapped) {
			if (where) collectTo.push(commonStringChunks[' where '], ...where);
			if (order) collectTo.push(commonStringChunks[' order by '], ...order);
			this.collectLimitOffset(collectTo, limit, offset);
			collectTo.push(commonStringChunks[') as '], table);
		}

		for (const k of withKeys) {
			const join = withParam![k]!;
			const relation = tableConfig.relations[k];
			if (!relation) throw new DrizzleError({ message: `Unknown relation "${tableConfig.name}" -> "${k}"` });
			const isSingle = relation.relationType === 'one';
			collectRelationalSubquery(subqueries, relation.targetTable);
			collectRelationalSubquery(subqueries, relation.throughTable);

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

			collectTo.push(rqbChunks.joinOpen);
			// Reserved for JSON object of relation's fields, known once relation's query is built
			const jsonIdx = collectTo.length;
			collectTo.push(undefined, rqbChunks.joinFrom);
			const innerSelection = this.collectRelationalQuery({
				table: targetTable,
				mode: isSingle ? 'first' : 'many',
				schema,
				queryConfig: join as DBQueryConfigWithComment,
				tableConfig: schema[relation.targetTableName]!,
				relationWhere: filter,
				errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
				depth: currentDepth + 1,
				withSubqueries: subqueries,
				strategy: currentDepth ? strategy : params?.strategy,
				isNestedMany: !isSingle,
				through: throughTable ? { table: throughTable, condition: joinCondition! } : undefined,
				nested: true,
			}, collectTo);
			collectTo.push(rqbChunks.joinClose, sql.identifier(k), rqbChunks.onTrue);

			const jsonChunks: SQLChunk[] = [isSingle ? rqbChunks.jsonObjectOpen : rqbChunks.jsonArrayAggOpen];
			for (let i = 0; i < innerSelection.length; ++i) {
				const key = innerSelection[i]!.key;
				if (i) jsonChunks.push(commonStringChunks[', ']);
				jsonChunks.push(new StringChunk(this.escapeString(key)), commonStringChunks[', '], sql.identifier(key));
			}
			jsonChunks.push(isSingle ? commonStringChunks[')'] : rqbChunks.jsonArrayAggClose);
			collectTo[jsonIdx] = new SQL(jsonChunks);

			selection.push({
				field: targetTable,
				fieldType: 'Nested',
				key: k,
				selection: innerSelection,
				isArray: !isSingle,
				isOptional: ((relation as AnyOne).optional ?? false)
					|| (join !== true
						&& !!(join as Exclude<typeof join, boolean | undefined>)
							.where),
			});
		}

		if (isWrapped) {
			if (order) collectTo.push(commonStringChunks[' order by '], ...order);
		} else {
			if (where) collectTo.push(commonStringChunks[' where '], ...where);
			if (order) collectTo.push(commonStringChunks[' order by '], ...order);
			this.collectLimitOffset(collectTo, limit, offset);
		}
		if (config !== true && config?.comment) collectTo.push(commonStringChunks[' '], sql.comment(config.comment));

		if (withIdx !== -1) collectTo[withIdx] = this.buildWithCTE([...subqueries.values()]);

		return selection;
	}

	private collectLimitOffset(
		collectTo: SQLChunk[],
		limit: number | Placeholder | undefined,
		offset: number | Placeholder | undefined,
	): void {
		if (limit !== undefined) {
			collectTo.push(commonStringChunks[' limit '], sql.param(limit, this.paginationEncoder));
		}
		if (offset !== undefined) {
			collectTo.push(commonStringChunks[' offset '], sql.param(offset, this.paginationEncoder));
		}
	}
}
