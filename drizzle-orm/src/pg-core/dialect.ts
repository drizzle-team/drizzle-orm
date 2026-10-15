import { aliasedTable, getOriginalColumnFromAlias } from '~/alias.ts';
import { CodecsCollection } from '~/codecs.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import { PgColumn, type PgCustomColumn } from '~/pg-core/columns/index.ts';
import type {
	AnyPgSelectQueryBuilder,
	PgDeleteConfig,
	PgInsertConfig,
	PgSelectJoinConfig,
	PgUpdateConfig,
} from '~/pg-core/query-builders/index.ts';
import type { PgSelectConfig, SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import { PgTable } from '~/pg-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import {
	type AnyOne,
	// AggregatedField,
	type BuildRelationalQueryResult,
	collectRelationalSubquery,
	type DBQueryConfigWithComment,
	getTableAsAliasSQL,
	makeDefaultRqbMapper,
	makeJitRqbMapper,
	type RelationalQueryStrategy,
	type RelationalRowsMapperGenerator,
	type RelationalWithSubqueries,
	relationExtrasToSQL,
	relationsFilterToSQL,
	relationsOrderToSQL,
	relationToSQL,
	type SchemaEntry,
	type TableRelationalConfig,
	type TablesRelationalConfig,
	type WithContainer,
} from '~/relations.ts';
import { and, isSQLWrapper, type SQLWrapper } from '~/sql/index.ts';
import {
	type DriverValueDecoder,
	type Name,
	type Query,
	SQL,
	sql,
	type SQLChunk,
	StringChunk,
	ValueRows,
} from '~/sql/sql.ts';
import { chunkKindOf, chunkKinds, isChunk } from '~/sql/sql.ts';
import { commonStringChunks } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, Table, TableColumns } from '~/table.ts';
import {
	getColumnFromDecoder,
	makeDefaultQueryMapper,
	makeJitQueryMapper,
	memoizeEscape,
	type RowsMapperGenerator,
	type UpdateSet,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { View } from '~/view.ts';
import { type PgCodecs, type PostgresType, resolvePgTypeAlias } from './codecs.ts';
import type { PgViewBase } from './view-base.ts';
import type { PgMaterializedView } from './view.ts';

/** Used to build mappers directly in driver in minipg */
export type PreparedQuerySelection = {
	type: 'plain';
	fields: SelectedFieldsOrdered;
} | {
	type: 'relational';
	fields: BuildRelationalQueryResult['selection'];
};

/** Selection shape converter for driver-side mapping, provided per driver where supported */
export type ShapeGenerator = (
	selection: PreparedQuerySelection,
	nullableObjectPaths: string[] | undefined,
) => any;

export interface PgDialectConfig {
	codecs?: PgCodecs;
	useJitMappers?: boolean;
	// Mapper replacement for driver-side mapping
	shapeGenerator?: ShapeGenerator;
}

const escapePgName = memoizeEscape((name) => `"${name.replace(/"/g, '""')}"`);
export class PgDialect {
	static readonly [entityKind]: string = 'PgDialect';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	readonly codecs: CodecsCollection<PostgresType>;
	readonly mapperGenerators: {
		rows: RowsMapperGenerator;
		relationalRows: RelationalRowsMapperGenerator;
	};
	readonly shapeGenerator?: ShapeGenerator;

	constructor(config?: PgDialectConfig) {
		this.codecs = new CodecsCollection<PostgresType>(resolvePgTypeAlias, config?.codecs);
		this.shapeGenerator = config?.shapeGenerator;
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
		return escapePgName(name);
	}

	escapeParam(num: number): string {
		return `$${num + 1}`;
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
		comment,
		useSelectionCastCodecs,
	}: PgDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: !useSelectionCastCodecs, table })
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
		from,
		joins,
		comment,
		useSelectionCastCodecs,
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

		const fromSql = from && new SQL([commonStringChunks[' from '], this.buildFromTable(from)]);

		const joinsSql = this.buildJoins(joins);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: !from, ignoreCastCodecs: !useSelectionCastCodecs, table })
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
		{ isSingleTable = false, ignoreCastCodecs = false, table }: {
			isSingleTable?: boolean;
			ignoreCastCodecs?: boolean;
			table?: PgTable | PgViewBase | SQL | Subquery;
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
			const override = codecOverride as PostgresType | undefined;

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

	private buildJoins(joins: PgSelectJoinConfig[] | undefined): SQL | undefined {
		if (!joins || joins.length === 0) {
			return undefined;
		}

		const joinsArray: SQLChunk[] = [];

		for (const [index, joinMeta] of joins.entries()) {
			if (index === 0) {
				joinsArray.push(commonStringChunks[' ']);
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
					sql`${new StringChunk(joinMeta.joinType)} join${lateralSql} ${
						tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined
					}${sql.identifier(origTableName)}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
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

		return new SQL(joinsArray);
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
		setFieldsFlat: setSelection,
		comment,
		useSelectionCastCodecs,
	}: PgSelectConfig): SQL {
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

		let distinctSql: SQL | undefined;
		if (distinct) {
			distinctSql = distinct === true
				? sql` distinct`
				: sql` distinct on (${sql.join(distinct.on, commonStringChunks[', '])})`;
		}

		const selection = this.buildSelection(fieldsList, {
			isSingleTable,
			ignoreCastCodecs: !useSelectionCastCodecs || setOperators.length > 0,
			table,
		});

		const tableSql = this.buildFromTable(table);

		const joinsSql = this.buildJoins(joins);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			orderBySql = sql` order by ${sql.join(orderBy, commonStringChunks[', '])}`;
		}

		let groupBySql;
		if (groupBy && groupBy.length > 0) {
			groupBySql = sql` group by ${sql.join(groupBy, commonStringChunks[', '])}`;
		}

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		const lockingClauseSql = sql.empty();
		if (lockingClause) {
			const clauseSql = sql` for ${new StringChunk(lockingClause.strength)}`;
			if (lockingClause.config.of) {
				clauseSql.append(
					sql` of ${
						sql.join(
							Array.isArray(lockingClause.config.of)
								? lockingClause.config.of.map((it) => sql.identifier(it[PgTable.Symbol.Name]))
								: [sql.identifier(lockingClause.config.of[PgTable.Symbol.Name])],
							commonStringChunks[', '],
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
			return this.buildSetOperations(finalQuery, setSelection!, useSelectionCastCodecs, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		outputSelection: SelectedFieldsOrdered,
		useSelectionCastCodecs: boolean | undefined,
		setOperators: PgSelectConfig['setOperators'],
	): SQL {
		for (let i = 0; i < setOperators.length; ++i) {
			const setOperator = setOperators[i]!;
			leftSelect = this.buildSetOperationQuery({ leftSelect, setOperator });
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
		overridingSystemValue_,
		comment,
		columnList,
		useSelectionCastCodecs,
	}: PgInsertConfig): SQL {
		const columns: Record<string, PgColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, PgColumn][] = columnList
			? columnList.map((name) => [name, columns[name]!])
			: Object.entries(columns);

		const colFilteredEntries: [string, PgColumn][] = select && !is(valuesOrSelect, SQL)
			? Object
				.keys((valuesOrSelect as TypedQueryBuilder<any>).getSelectedFields())
				.map((key) => [key, columns[key]] as [string, PgColumn])
			: overridingSystemValue_
			? colEntries
			: colEntries.filter(([_, col]) => !col.shouldDisableInsert());

		const width = colFilteredEntries.length;
		const insertColumns: PgColumn[] = new Array(width);
		const insertKeys: string[] = new Array(width);
		const insertOrderArr: SQLChunk[] = new Array(width * 2 + 1);
		let writeIdx = 0;
		insertOrderArr[writeIdx++] = commonStringChunks['('];
		for (let i = 0; i < width; ++i) {
			const [key, column] = colFilteredEntries[i]!;
			insertKeys[i] = key;
			insertColumns[i] = column;
			insertOrderArr[writeIdx++] = sql.identifier(column.name);

			if (i < width - 1) insertOrderArr[writeIdx++] = commonStringChunks[', '];
		}
		insertOrderArr[writeIdx++] = commonStringChunks[')'];
		const insertOrder = new SQL(insertOrderArr);

		let valuesSqlList: SQLChunk[];
		if (select) {
			valuesSqlList = [(valuesOrSelect as AnyPgSelectQueryBuilder | SQL).getSQL()];
		} else {
			const values = valuesOrSelect as Record<string, unknown>[];
			const cells: unknown[] = new Array(values.length * width);

			let writeIdx = 0;
			for (let valueIndex = 0; valueIndex < values.length; ++valueIndex) {
				const value = values[valueIndex]!;

				for (let i = 0; i < width; ++i) {
					const colValue = value[insertKeys[i]!];
					if (colValue !== undefined) {
						cells[writeIdx++] = colValue;
						continue;
					}

					const col = insertColumns[i]!;
					// eslint-disable-next-line unicorn/no-negated-condition
					if (col.defaultFn !== undefined) {
						cells[writeIdx++] = col.defaultFn();
						// eslint-disable-next-line unicorn/no-negated-condition
					} else if (!col.default && col.onUpdateFn !== undefined) {
						cells[writeIdx++] = col.onUpdateFn();
					} else {
						cells[writeIdx++] = commonStringChunks['default'];
					}
				}
			}

			valuesSqlList = [commonStringChunks['values '], new ValueRows(cells, insertColumns)];
		}

		const withSql = this.buildWithCTE(withList);

		const valuesSql = new SQL(valuesSqlList);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: !useSelectionCastCodecs, table })
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

	sqlToQuery(sql: SQL, invokeSource?: 'indexes' | undefined): Query {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			codecs: this.codecs,
			invokeSource,
		});
	}
	_sqlToQuery(sql: SQL): Query {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			codecs: this.codecs,
			tagged: true,
		});
	}

	private buildRqbColumn(
		table: SchemaEntry,
		field: unknown,
		key: string,
		inJson: boolean,
		selection: BuildRelationalQueryResult['selection'],
		tableTsName: string,
	) {
		let decoderColumn: Column | undefined;
		let subqueryDecoder: DriverValueDecoder<any, any> | undefined;
		let fieldType: BuildRelationalQueryResult['selection'][number]['fieldType'];
		let output: SQL;

		if (is(field, Column)) {
			decoderColumn = field;
			fieldType = 'Column';

			const cast = inJson && (<PgCustomColumn<any>> field).jsonSelectIdentifier
				? undefined
				: this.codecs.codecsOf(field)[inJson ? 'castInJson' : 'cast'];
			if (cast || (inJson && (<PgCustomColumn<any>> field).jsonSelectIdentifier)) {
				const name = sql`${table}.${sql.identifier(field.name)}`;
				const casted = cast
					? cast(name, (<any> field).dimensions)
					: (<PgCustomColumn<any>> field).jsonSelectIdentifier!(name, sql, (<PgCustomColumn<any>> field).dimensions);
				output = sql`${casted} as ${sql.identifier(key)}`;
			} else {
				output = new SQL([
					table,
					commonStringChunks['.'],
					sql.identifier(field.name),
					commonStringChunks[' as '],
					sql.identifier(key),
				]);
			}
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
		} else if (is(field, Subquery)) {
			const innerField = Object.values(field._.selectedFields)[0];

			if (is(innerField, Column)) {
				decoderColumn = innerField;
				subqueryDecoder = innerField;
			} else if (is(innerField, SQL.Aliased)) {
				decoderColumn = getColumnFromDecoder(innerField);
				subqueryDecoder = innerField.sql.decoder;
			} else if (is(innerField, SQL)) {
				decoderColumn = getColumnFromDecoder(innerField);
				subqueryDecoder = innerField.decoder;
			}
			fieldType = 'Subquery';

			const q = sql`${table}.${sql.identifier(field._.alias)}`;
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
					: `Views and subqueries with nested selections are not supported by the relational query builder`,
			});
		}

		selection.push(
			(decoderColumn
				? {
					key,
					field,
					fieldType,
					subqueryDecoder,
					codec: !inJson || !(<PgCustomColumn<any>> decoderColumn).mapFromJsonValue
						? this.codecs.get(decoderColumn, inJson ? 'normalizeInJson' : 'normalize')
						: undefined,
					arrayDimensions: (<PgColumn> decoderColumn).dimensions,
				}
				: {
					key,
					field,
					fieldType,
					subqueryDecoder,
				}) as BuildRelationalQueryResult['selection'][number],
		);

		return output;
	}

	private buildColumns = (
		table: SchemaEntry,
		columns: Record<string, unknown>,
		selection: BuildRelationalQueryResult['selection'],
		inJson: boolean,
		tableTsName: string,
		config?: DBQueryConfigWithComment<'many'>,
	) => {
		if (!config?.columns) {
			return sql.join(
				Object.entries(columns).map(([k, v]) => {
					return this.buildRqbColumn(table, v, k, inJson, selection, tableTsName);
				}),
				commonStringChunks[', '],
			);
		}

		const entries = Object.entries(config.columns);
		const columnContainer = columns;

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
			? sql.join(columnIdentifiers, commonStringChunks[', '])
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
		throughJoin,
		nested,
		withSubqueries,
		strategy,
	}: {
		schema: TablesRelationalConfig;
		table: SchemaEntry;
		tableConfig: TableRelationalConfig;
		queryConfig?: DBQueryConfigWithComment<'many'> | true;
		relationWhere?: SQL;
		mode: 'first' | 'many';
		errorPath?: string;
		depth?: number;
		throughJoin?: SQL;
		nested?: boolean;
		withSubqueries?: RelationalWithSubqueries;
		strategy?: RelationalQueryStrategy;
	}): BuildRelationalQueryResult {
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

		const filter = params && 'where' in params
			? relationsFilterToSQL(table, params.where, tableConfig.relations, schema, subqueries)
			: undefined;
		const where: SQL | undefined = filter && relationWhere
			? and(filter.sql, relationWhere)
			: filter
			? filter.sql
			: relationWhere;
		const order = params?.orderBy
			? relationsOrderToSQL(table, params.orderBy, tableConfig.relations, schema, subqueries)
			: undefined;
		const columns = this.buildColumns(
			table,
			tableConfig.table[TableColumns],
			selection,
			!!nested,
			tableConfig.name,
			params,
		);
		const extras = params?.extras
			? relationExtrasToSQL(table, params.extras, this.codecs, nested)
			: undefined;
		if (extras) selection.push(...extras.selection);

		const selectionArr: SQL[] = [];
		if (columns) selectionArr.push(columns);
		if (extras?.sql) selectionArr.push(extras.sql);

		let joins: SQL | undefined;
		switch (params) {
			case undefined:
				break;
			default: {
				const { with: withParam } = params as WithContainer;
				if (!withParam) break;

				const withKeys: string[] = [];
				for (const key of Object.keys(withParam)) {
					if (withParam[key]) withKeys.push(key);
				}
				if (!withKeys.length) break;

				const joinChunks: SQLChunk[] = new Array(withKeys.length * 2);
				joinChunks[0] = commonStringChunks[' '];

				for (let readIdx = 0, writeIdx = 1; readIdx < withKeys.length; ++readIdx) {
					const k = withKeys[readIdx]!;
					const join = withParam[k]!;

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
						? (aliasedTable(relation.throughTable, `tr${currentDepth}`) as
							| Table
							| View
							| Subquery)
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

					const joinQuery = sql`left join lateral(select ${
						isSingle
							? sql`row_to_json(${sql.identifier('t')}.*) ${sql.identifier('r')}`
							: sql`coalesce(json_agg(row_to_json(${sql.identifier('t')}.*)), '[]') as ${sql.identifier('r')}`
					} from (${innerQuery.sql}) as ${sql.identifier('t')}) as ${sql.identifier(k)} on true`;

					joinChunks[writeIdx++] = joinQuery;
					if (readIdx < withKeys.length - 1) joinChunks[writeIdx++] = commonStringChunks[' '];
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
		const selectionSet = sql.join(selectionArr, commonStringChunks[', ']);
		const comment = config !== true && config?.comment
			? sql.comment(config.comment)
			: undefined;

		const withSql = currentDepth ? undefined : this.buildWithCTE([...subqueries.values()]);
		const whereSql = where ? sql` where ${where}` : undefined;
		const orderSql = order ? sql` order by ${order}` : undefined;
		const limitSql = limit !== undefined || offset !== undefined
			? sql`${limit !== undefined ? sql` limit ${limit}` : undefined}${
				offset !== undefined ? sql` offset ${offset}` : undefined
			}`
			: undefined;

		// Unordered `limit` alone already stops at the limit, pagination only goes inside when rows get sorted or skipped
		const isPaginatedFirst = offset !== undefined || (limit !== undefined && order);

		// Optimize slow queries caused by planner applying pagination or filters after building relations
		// Relations are joined to an already filtered and paginated table:
		// - `order by ... limit` and `offset` aren't always pushed below lateral joins, relations would get built
		// for sorted out and skipped rows
		// - past `join_collapse_limit` joins are executed in the order they're written in, relations would get
		// built before filters on relations are applied. Filters on table's own columns are pushed down regardless
		// Unless paginated, table's subquery has to stay flattenable, hence no `order by` or `limit` in it
		const query = joins && isOptimized && (isPaginatedFirst || filter?.hasRelationFilters)
			? sql`${withSql}select ${selectionSet} from (select ${table}.* from ${
				getTableAsAliasSQL(table)
			}${throughJoin}${whereSql}${
				isPaginatedFirst ? sql`${orderSql}${limitSql}` : undefined
			}) as ${table}${joins}${orderSql}${isPaginatedFirst ? undefined : limitSql}${
				comment ? sql` ${comment}` : undefined
			}`
			: sql`${withSql}select ${selectionSet} from ${
				getTableAsAliasSQL(table)
			}${throughJoin}${joins}${whereSql}${orderSql}${limitSql}${comment ? sql` ${comment}` : undefined}`;

		return {
			sql: query,
			selection,
		};
	}
}
