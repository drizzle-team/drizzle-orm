import { aliasedTable, getOriginalColumnFromAlias } from '~/alias.ts';
import { CodecsCollection } from '~/codecs.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import {
	type AnyOne,
	// AggregatedField,
	type BuildRelationalQueryConfig,
	type BuildRelationalQueryResult,
	buildRqbColumns,
	collectRelationalSubquery,
	type DBQueryConfig,
	getTableAsAliasSQL,
	makeDefaultRqbMapper,
	makeJitRqbMapper,
	relationalQueryWhereToSQL,
	type RelationalRowsMapperGenerator,
	type RelationalWithSubqueries,
	relationExtrasToSQL,
	relationsOrderToSQL,
	relationToSQL,
	type WithContainer,
} from '~/relations.ts';
import { commonStringChunks, StringChunk } from '~/sql/common-chunks.ts';
import type { Name, Placeholder } from '~/sql/index.ts';
import { type Query, SQL, sql, type SQLChunk } from '~/sql/sql.ts';
import { chunkKindOf, chunkKinds, isChunk } from '~/sql/sql.ts';
import { ValueRows } from '~/sql/sql.ts';
import { resolveSQLiteTypeAlias, resolveUnionType, type SQLiteCodecs, type SQLiteType } from '~/sqlite-core/codecs.ts';
import { SQLiteColumn } from '~/sqlite-core/columns/index.ts';
import type {
	AnySQLiteSelectQueryBuilder,
	SQLiteDeleteConfig,
	SQLiteInsertConfig,
	SQLiteUpdateConfig,
} from '~/sqlite-core/query-builders/index.ts';
import { SQLiteTable } from '~/sqlite-core/table.ts';
import type { Subquery } from '~/subquery.ts';
import { getTableName, Table, TableColumns } from '~/table.ts';
import {
	makeDefaultQueryMapper,
	makeJitQueryMapper,
	memoizeEscape,
	orderSelectedFields,
	type RowsMapperGenerator,
	type UpdateSet,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { View } from '~/view.ts';
import type {
	SelectedFieldsOrdered,
	SQLiteSelectConfig,
	SQLiteSelectJoinConfig,
} from './query-builders/select.types.ts';
import type { SQLiteViewBase } from './view-base.ts';

export interface SQLiteDialectConfig {
	codecs?: SQLiteCodecs;
	useJitMappers?: boolean;
}

const escapeSQLiteName = memoizeEscape((name) => `"${name.replace(/"/g, '""')}"`);
// Stored separately - differ per dialect
const rqbChunks = {
	json: new StringChunk('json'),
	object: new StringChunk('_object('),
	groupArray: new StringChunk('_group_array(json_object('),
	groupArrayClose: new StringChunk('))'),
	relationFrom: new StringChunk(' as "r" from ('),
	relationClose: new StringChunk(') as "t") as '),
} as const;

export interface SQLiteBuildRelationalQueryConfig
	extends Omit<BuildRelationalQueryConfig<DBQueryConfig<'many'>>, 'strategy'>
{
	jsonb: SQL;
}

export class SQLiteDialect {
	static readonly [entityKind]: string = 'SQLiteDialect';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

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
		return escapeSQLiteName(name);
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
		returning,
		withList,
		limit,
		orderBy,
		useSelectionCastCodecs,
	}: SQLiteDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: !useSelectionCastCodecs, table })
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
		useSelectionCastCodecs,
	}: SQLiteUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const setSql = this.buildUpdateSet(table, set);

		const fromSql = from && new SQL([commonStringChunks[' from '], this.buildFromTable(from)]);

		const joinsSql = this.buildJoins(joins);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: !useSelectionCastCodecs, table })
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
				chunks.push(commonStringChunks[', ']);
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
					joinsArray.push(commonStringChunks[' ']);
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
					joinsArray.push(commonStringChunks[' ']);
				}
			}
		}

		return new SQL(joinsArray);
	}

	private buildLimit(limit: number | Placeholder | undefined): SQL | undefined {
		return typeof limit === 'object'
				|| (typeof limit === 'number')
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
					orderByList.push(commonStringChunks[', ']);
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
		useSelectionCastCodecs,
	}: SQLiteSelectConfig): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<SQLiteColumn>(fields, undefined, this.codecs);

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
			table,
			ignoreCastCodecs: !useSelectionCastCodecs || setOperators.length > 0,
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
					groupByList.push(commonStringChunks[', ']);
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
			return this.buildSetOperations(finalQuery, fieldsList, useSelectionCastCodecs, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		outputSelection: SelectedFieldsOrdered,
		useSelectionCastCodecs: boolean | undefined,
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

			orderBySql = sql` order by ${sql.join(orderByValues, commonStringChunks[', '])}`;
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
		useSelectionCastCodecs,
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
		insertOrderArr[writeIdx++] = commonStringChunks['('];
		for (let i = 0; i < colEntriesFiltered.length; ++i) {
			const [, { name }] = colEntriesFiltered[i]!;
			insertOrderArr[writeIdx++] = sql.identifier(name);

			if (i < colEntriesFiltered.length - 1) insertOrderArr[writeIdx++] = commonStringChunks[', '];
		}
		insertOrderArr[writeIdx++] = commonStringChunks[')'];
		const insertOrder = new SQL(insertOrderArr);

		let valuesSqlList: SQLChunk[];

		if (select) {
			valuesSqlList = [(valuesOrSelect as AnySQLiteSelectQueryBuilder | SQL).getSQL()];
		} else {
			const values = valuesOrSelect as Record<string, unknown>[];
			const cells: unknown[] = new Array(values.length * colEntriesFiltered.length);

			let writeIdx = 0;

			for (let valueIndex = 0; valueIndex < values.length; ++valueIndex) {
				const value = values[valueIndex]!;

				for (let i = 0; i < colEntriesFiltered.length; ++i) {
					const [fieldName, col] = colEntriesFiltered[i]!;
					const colValue = value[fieldName];
					if (colValue === undefined) {
						if (col.defaultFn !== undefined) {
							cells[writeIdx++] = col.defaultFn();
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (col.default !== null && col.default !== undefined) {
							cells[writeIdx++] = col.default;
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (col.onUpdateFn !== undefined) {
							cells[writeIdx++] = col.onUpdateFn();
						} else {
							cells[writeIdx++] = commonStringChunks['null'];
						}
					} else {
						cells[writeIdx++] = colValue;
					}
				}
			}

			valuesSqlList = [commonStringChunks['values '], new ValueRows(cells, colEntriesFiltered.map(([, col]) => col))];
		}

		const withSql = this.buildWithCTE(withList);

		const valuesSql = new SQL(valuesSqlList);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: !useSelectionCastCodecs, table })
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

	buildRelationalQuery(
		config: Omit<SQLiteBuildRelationalQueryConfig, 'through'>,
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
		nested,
		errorPath,
		depth,
		through,
		jsonb,
		withSubqueries,
	}: SQLiteBuildRelationalQueryConfig, collectTo: SQLChunk[]): BuildRelationalQueryResult['selection'] {
		const selection: BuildRelationalQueryResult['selection'] = [];
		const isSingle = mode === 'first';
		const params = config === true ? undefined : config;
		const currentPath = errorPath ?? '';
		const currentDepth = depth ?? 0;
		const subqueries: RelationalWithSubqueries = withSubqueries ?? new Map();
		if (!currentDepth) {
			collectRelationalSubquery(subqueries, table);
			table = aliasedTable(table, `d${currentDepth}`);
		}

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

		const { sql: where } = relationalQueryWhereToSQL(
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
			const extras = relationExtrasToSQL(table, params.extras, this.codecs, !!nested, collectTo);
			selection.push(...extras.selection);
			if (extras.sql) ++selected;
			else collectTo.length = mark;
		}

		if (!selected && !withKeys.length) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
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

			if (selected++) collectTo.push(commonStringChunks[', ']);
			// Reserved for JSON of relation's fields, known once relation's query is built
			const jsonIdx = collectTo.length;
			collectTo.push(undefined, rqbChunks.relationFrom);
			const innerSelection = this.collectRelationalQuery({
				table: targetTable,
				mode: isSingle ? 'first' : 'many',
				schema,
				queryConfig: join as DBQueryConfig,
				tableConfig: schema[relation.targetTableName]!,
				relationWhere: filter,
				nested: true,
				errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
				depth: currentDepth + 1,
				withSubqueries: subqueries,
				through: throughTable ? { table: throughTable, condition: joinCondition! } : undefined,
				jsonb,
			}, collectTo);
			collectTo.push(rqbChunks.relationClose, sql.identifier(k));

			const jsonChunks: SQLChunk[] = [
				commonStringChunks['(select '],
				nested ? jsonb : rqbChunks.json,
				isSingle ? rqbChunks.object : rqbChunks.groupArray,
			];
			for (let i = 0; i < innerSelection.length; ++i) {
				const s = innerSelection[i]!;
				if (i) jsonChunks.push(commonStringChunks[', ']);
				jsonChunks.push(new StringChunk(this.escapeString(s.key)), commonStringChunks[', ']);
				if (s.selection) {
					jsonChunks.push(jsonb, commonStringChunks['('], sql.identifier(s.key), commonStringChunks[')']);
				} else {
					jsonChunks.push(sql.identifier(s.key));
				}
			}
			jsonChunks.push(isSingle ? commonStringChunks[')'] : rqbChunks.groupArrayClose);
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

		collectTo.push(commonStringChunks[' from ']);
		getTableAsAliasSQL(table, collectTo);
		if (through) {
			collectTo.push(commonStringChunks[' inner join ']);
			getTableAsAliasSQL(through.table, collectTo);
			collectTo.push(commonStringChunks[' on '], ...through.condition);
		}
		if (where) collectTo.push(commonStringChunks[' where '], ...where);
		if (order) collectTo.push(commonStringChunks[' order by '], ...order);
		if (limit !== undefined) collectTo.push(commonStringChunks[' limit '], limit as SQLChunk);
		if (offset !== undefined) collectTo.push(commonStringChunks[' offset '], offset as SQLChunk);

		if (withIdx !== -1) collectTo[withIdx] = this.buildWithCTE([...subqueries.values()]);

		return selection;
	}
}
