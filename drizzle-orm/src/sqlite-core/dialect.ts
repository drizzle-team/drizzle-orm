import { aliasedTable, getOriginalColumnFromAlias } from '~/alias.ts';
import { CodecsCollection } from '~/codecs.ts';
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
import { Param, type Query, SQL, sql, type SQLChunk, StringChunk, View } from '~/sql/sql.ts';
import { resolveSQLiteTypeAlias, resolveUnionType, type SQLiteCodecs, type SQLiteType } from '~/sqlite-core/codecs.ts';
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

export interface SQLiteDialectConfig {
	codecs?: SQLiteCodecs;
	useJitMappers?: boolean;
}

export class SQLiteDialect {
	static readonly [entityKind]: string = 'SQLiteDialect';

	readonly codecs: CodecsCollection<SQLiteType>;
	readonly mapperGenerators: {
		rows: RowsMapperGenerator;
		relationalRows: RelationalRowsMapperGenerator;
	};

	constructor(config?: SQLiteDialectConfig) {
		this.codecs = new CodecsCollection<SQLiteType>(resolveSQLiteTypeAlias, config?.codecs);
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
		returning,
		withList,
		limit,
		orderBy,
		ignoreSelectionCastCodecs,
	}: SQLiteDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: ignoreSelectionCastCodecs, table })
			}`
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
		returning,
		withList,
		joins,
		from,
		limit,
		orderBy,
		ignoreSelectionCastCodecs,
	}: SQLiteUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const setSql = this.buildUpdateSet(table, set);

		const fromSql = from && new SQL([new StringChunk(' from '), this.buildFromTable(from)]);

		const joinsSql = this.buildJoins(joins);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: ignoreSelectionCastCodecs, table })
			}`
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
		{ isSingleTable = false, ignoreCastCodecs = false, table }: {
			isSingleTable?: boolean;
			ignoreCastCodecs?: boolean;
			table?: SQLiteTable | SQLiteViewBase | SQL | Subquery;
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
			const override = codecOverride as SQLiteType | undefined;

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
				chunks.push(new StringChunk(', '));
			}
		}

		return new SQL(chunks);
	}

	private buildJoins(
		joins: SQLiteSelectJoinConfig[] | undefined,
	): SQL | undefined {
		if (!joins || joins.length === 0) {
			return undefined;
		}

		const joinsArray: SQLChunk[] = [];

		if (joins) {
			for (const [index, joinMeta] of joins.entries()) {
				if (index === 0) {
					joinsArray.push(new StringChunk(' '));
				}
				const table = joinMeta.table;
				const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : undefined;

				if (is(table, SQLiteTable)) {
					const tableName = table[SQLiteTable.Symbol.Name];
					const tableSchema = table[SQLiteTable.Symbol.Schema];
					const origTableName = table[SQLiteTable.Symbol.OriginalName];
					const alias = tableName === origTableName ? undefined : joinMeta.alias;
					joinsArray.push(
						sql`${new StringChunk(joinMeta.joinType)} join ${
							tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined
						}${
							sql.identifier(
								origTableName,
							)
						}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
					);
				} else {
					joinsArray.push(
						sql`${new StringChunk(joinMeta.joinType)} join ${table}${onSql}`,
					);
				}
				if (index < joins.length - 1) {
					joinsArray.push(new StringChunk(' '));
				}
			}
		}

		return new SQL(joinsArray);
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
		const orderByList: SQLChunk[] = [];

		if (orderBy) {
			for (const [index, orderByValue] of orderBy.entries()) {
				orderByList.push(orderByValue);

				if (index < orderBy.length - 1) {
					orderByList.push(new StringChunk(', '));
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
		ignoreSelectionCastCodecs,
	}: SQLiteSelectConfig): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<SQLiteColumn>(fields, undefined, this.codecs);
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

		const selection = this.buildSelection(fieldsList, {
			isSingleTable,
			table,
			ignoreCastCodecs: ignoreSelectionCastCodecs || setOperators.length > 0,
		});

		const tableSql = this.buildFromTable(table);

		const joinsSql = this.buildJoins(joins);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		const groupByList: SQLChunk[] = [];
		if (groupBy) {
			for (const [index, groupByValue] of groupBy.entries()) {
				groupByList.push(groupByValue);

				if (index < groupBy.length - 1) {
					groupByList.push(new StringChunk(', '));
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
			return this.buildSetOperations(finalQuery, fieldsList, ignoreSelectionCastCodecs, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		outputSelection: SelectedFieldsOrdered,
		ignoreSelectionCastCodecs: boolean | undefined,
		setOperators: SQLiteSelectConfig['setOperators'],
	): SQL {
		for (let i = 0; i < setOperators.length; ++i) {
			const setOperator = setOperators[i]!;

			leftSelect = this.buildSetOperationQuery({ leftSelect, setOperator });

			const rightSelection = orderSelectedFields(setOperator.rightSelect.getSelectedFields());
			for (let j = 0; j < outputSelection.length; ++j) {
				const l = outputSelection[j]!;
				const lPath = l.path.join('.');
				const r = rightSelection.find((e) => e.path.join('.') === lPath)!; // Equivalency of selections is a pre-requisite for unions

				const lc = (l.codecOverride ?? l.column?.codec) as SQLiteType | undefined;
				const rc = (r.codecOverride ?? r.column?.codec) as SQLiteType | undefined;

				l.codecOverride = lc && rc ? resolveUnionType(lc, rc) : lc;
			}
		}

		for (let i = 0; i < outputSelection.length; ++i) {
			const out = outputSelection[i]!;
			out.codec = out.codecOverride
				? this.codecs.get(out.column!, 'normalize', out.codecOverride as SQLiteType)
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
		setOperator: SQLiteSelectConfig['setOperators'][number];
	}): SQL {
		// SQLite doesn't support parenthesis in set operations
		const leftChunk = sql`${leftSelect.getSQL()} `;
		const rightChunk = sql`${rightSelect.withoutSelectionCastCodecs().getSQL()}`;

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

			orderBySql = sql` order by ${sql.join(orderByValues, new StringChunk(', '))}`;
		}

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const operatorChunk = new StringChunk(`${type} ${isAll ? 'all ' : ''}`);

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
		columnList,
		ignoreSelectionCastCodecs,
	}: SQLiteInsertConfig): SQL {
		// const isSingleValue = values.length === 1;
		const columns: Record<string, SQLiteColumn> = table[Table.Symbol.Columns];

		const colEntries: [string, SQLiteColumn][] = columnList
			? columnList.map((name) => [name, columns[name]!])
			: Object.entries(columns);
		const colEntriesFiltered: [string, SQLiteColumn][] = select && !is(valuesOrSelect, SQL)
			? Object
				.keys((valuesOrSelect as TypedQueryBuilder<any>).getSelectedFields())
				.map((key) => [key, columns[key]] as [string, SQLiteColumn])
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

		const valuesSqlList: SQLChunk[] = Array.from({
			length: select
				? 1
				: (colEntriesFiltered.length * 2 + 1) * (valuesOrSelect as Record<string, unknown>[]).length
					+ (valuesOrSelect as Record<string, unknown>[]).length,
		});

		if (select) {
			valuesSqlList[0] = (valuesOrSelect as AnySQLiteSelectQueryBuilder | SQL).getSQL();
		} else {
			const values = valuesOrSelect as Record<string, unknown>[];

			let writeIdx = 0;
			valuesSqlList[writeIdx++] = new StringChunk('values ');

			for (let valueIndex = 0; valueIndex < values.length; ++valueIndex) {
				const value = values[valueIndex]!;

				valuesSqlList[writeIdx++] = new StringChunk('(');
				for (let i = 0; i < colEntriesFiltered.length; ++i) {
					const [fieldName, col] = colEntriesFiltered[i]!;
					const colValue = value[fieldName];
					if (colValue === undefined) {
						let defaultValue;
						if (col.defaultFn !== undefined) {
							const defaultFnResult = col.defaultFn();
							defaultValue = is(defaultFnResult, SQL)
								? defaultFnResult
								: sql.param(defaultFnResult, col);
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (col.default !== null && col.default !== undefined) {
							defaultValue = is(col.default, SQL)
								? col.default
								: sql.param(col.default, col);
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (col.onUpdateFn !== undefined) {
							const onUpdateFnResult = col.onUpdateFn();
							defaultValue = is(onUpdateFnResult, SQL)
								? onUpdateFnResult
								: sql.param(onUpdateFnResult, col);
						} else {
							defaultValue = new StringChunk('null');
						}
						valuesSqlList[writeIdx++] = defaultValue;
					} else {
						valuesSqlList[writeIdx++] = is(colValue, SQL) ? colValue : new Param(colValue, col);
					}

					if (i < colEntriesFiltered.length - 1) {
						valuesSqlList[writeIdx++] = new StringChunk(', ');
					}
				}

				valuesSqlList[writeIdx++] = new StringChunk(')');

				if (valueIndex < values.length - 1) {
					valuesSqlList[writeIdx++] = new StringChunk(`, `);
				}
			}
		}

		const withSql = this.buildWithCTE(withList);

		const valuesSql = new SQL(valuesSqlList);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: ignoreSelectionCastCodecs, table })
			}`
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
			const casted = inJson && (<SQLiteCustomColumn<any>> field).jsonSelectIdentifier
				? (<SQLiteCustomColumn<any>> field).jsonSelectIdentifier!(name, sql)
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
					codec: !inJson || !(<SQLiteCustomColumn<any>> decoderColumn).mapFromJsonValue
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
		tableTsName: string,
		config?: DBQueryConfig<'many'>,
	) => {
		if (!config?.columns) {
			return sql.join(
				Object.entries(table[TableColumns]).map(([k, v]) => {
					return this.buildRqbColumn(table, v, k, inJson, selection, tableTsName);
				}),
				new StringChunk(', '),
			);
		}

		const columnIdentifiers: SQL[] = [];

		const selectedColumns = this.getSelectedTableColumns(
			table,
			config?.columns,
		);

		for (const { column, tsName } of selectedColumns) {
			columnIdentifiers.push(this.buildRqbColumn(table, column, tsName, inJson, selection, tableTsName));
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

		const columns = this.buildColumns(table, selection, !!isNested, tableConfig.name, params);

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
			? relationExtrasToSQL(table, params.extras, this.codecs, !!isNested)
			: undefined;
		if (extras) selection.push(...extras.selection);

		let joins: SQL | undefined;
		switch (params) {
			case undefined:
				break;
			default: {
				const { with: withParam } = params as WithContainer;
				if (!withParam) break;

				const withEntries = Object.entries(withParam).filter(([_, v]) => v);
				if (!withEntries.length) break;

				const joinChunks: SQLChunk[] = new Array(withEntries.length * 2 - 1);
				for (let readIdx = 0, writeIdx = 0; readIdx < withEntries.length; ++readIdx) {
					const [k, join] = withEntries[readIdx]!;

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
						innerQuery.selection.map((s) => {
							return sql`${new StringChunk(this.escapeString(s.key))}, ${
								s.selection
									? sql`${jsonb}(${sql.identifier(s.key)})`
									: sql.identifier(s.key)
							}`;
						}),
						new StringChunk(', '),
					);

					const json = isNested ? jsonb : sql`json`;

					const joinQuery = isSingle
						? sql`(select ${json}_object(${jsonColumns}) as ${sql.identifier('r')} from (${innerQuery.sql}) as ${
							sql.identifier(
								't',
							)
						}) as ${sql.identifier(k)}`
						: sql`(select ${json}_group_array(json_object(${jsonColumns})) as ${
							sql.identifier(
								'r',
							)
						} from (${innerQuery.sql}) as ${sql.identifier('t')}) as ${sql.identifier(k)}`;

					joinChunks[writeIdx++] = joinQuery;
					if (readIdx < withEntries.length - 1) joinChunks[writeIdx++] = new StringChunk(', ');
				}

				joins = new SQL(joinChunks);

				break;
			}
		}

		const selectionArr = [columns, extras?.sql, joins].filter(
			(e) => e !== undefined,
		);
		if (!selectionArr.length) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}
		const selectionSet = sql.join(selectionArr, new StringChunk(', '));

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
