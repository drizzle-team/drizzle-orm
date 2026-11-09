import { aliasedTable, getOriginalColumnFromAlias } from '~/alias.ts';
import { CockroachColumn } from '~/cockroach-core/columns/index.ts';
import type {
	AnyCockroachSelectQueryBuilder,
	CockroachDeleteConfig,
	CockroachInsertConfig,
	CockroachSelectJoinConfig,
	CockroachUpdateConfig,
} from '~/cockroach-core/query-builders/index.ts';
import type { CockroachSelectConfig, SelectedFieldsOrdered } from '~/cockroach-core/query-builders/select.types.ts';
import { CockroachTable } from '~/cockroach-core/table.ts';
import { CodecsCollection } from '~/codecs.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	AnyOne,
	BuildRelationalQueryConfig,
	BuildRelationalQueryResult,
	DBQueryConfigRoot,
	RelationalRowsMapperGenerator,
	WithContainer,
} from '~/relations.ts';
import {
	buildRqbColumns,
	collectSubqueryAndUsedTables,
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
import { type Name, type Query, SQL, sql, type SQLChunk, ValueRows } from '~/sql/sql.ts';
import { chunkKindOf, chunkKinds, isChunk, unqualifyColumns } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { getTableName, Qualifier, Table, TableColumns } from '~/table.ts';
import { upgradeIfNeeded } from '~/up-migrations/cockroach.ts';
import {
	makeDefaultQueryMapper,
	makeJitQueryMapper,
	memoizeEscape,
	type RowsMapperGenerator,
	type UpdateSet,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { View } from '~/view.ts';
import { type CockroachCodecs, type CockroachType, resolveCockroachTypeAlias } from './codecs.ts';
import type { CockroachSession } from './session.ts';
import type { CockroachViewBase } from './view-base.ts';
import type { CockroachMaterializedView } from './view.ts';

export interface CockroachDialectConfig {
	useJitMappers?: boolean;
	codecs?: CockroachCodecs;
}

const escapeCockroachName = memoizeEscape((name) => `"${name.replace(/"/g, '""')}"`);
// Stored separately - differ per dialect
const rqbChunks = {
	relationField: new StringChunk('."r" as '),
	joinOne: new StringChunk(' left join lateral(select row_to_json("t".*) "r" from ('),
	joinMany: new StringChunk(` left join lateral(select coalesce(json_agg(row_to_json("t".*)), '[]') as "r" from (`),
	joinClose: new StringChunk(') as "t") as '),
	onTrue: new StringChunk(' on true'),
} as const;

export class CockroachDialect {
	static readonly [entityKind]: string = 'CockroachDialect';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	readonly codecs: CodecsCollection<CockroachType>;
	readonly mapperGenerators: {
		rows: RowsMapperGenerator;
		relationalRows: RelationalRowsMapperGenerator;
	};

	constructor(config?: CockroachDialectConfig) {
		this.codecs = new CodecsCollection<CockroachType>(resolveCockroachTypeAlias, config?.codecs);
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

	async migrate(
		migrations: MigrationMeta[],
		session: CockroachSession,
		config: string | MigrationConfig,
	): Promise<void | MigratorInitFailResponse> {
		const migrationsTable = typeof config === 'string'
			? '__drizzle_migrations'
			: (config.migrationsTable ?? '__drizzle_migrations');
		const migrationsSchema = typeof config === 'string'
			? 'drizzle'
			: (config.migrationsSchema ?? 'drizzle');

		await session.execute(
			sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`,
		);

		const { newDb } = await upgradeIfNeeded(
			migrationsSchema,
			migrationsTable,
			session,
			migrations,
		);

		if (newDb) {
			const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
				id INT GENERATED ALWAYS AS IDENTITY,
				hash text NOT NULL,
				created_at bigint,
				name text,
				applied_at timestamp with time zone DEFAULT now()
			)
		`;

			await session.execute(migrationTableCreate);
		}

		const dbMigrations = await session.objects<{
			id: number;
			hash: string;
			created_at: string;
			name: string | null;
		}>(
			sql`select id, hash, created_at, name from ${sql.identifier(migrationsSchema)}.${
				sql.identifier(
					migrationsTable,
				)
			}`,
		);

		if (typeof config === 'object' && config.init) {
			if (dbMigrations.length) {
				return { exitCode: 'databaseMigrations' as const };
			}

			if (migrations.length > 1) {
				return { exitCode: 'localMigrations' as const };
			}

			const [migration] = migrations;

			if (!migration) return;

			await session.execute(
				sql`insert into ${sql.identifier(migrationsSchema)}.${
					sql.identifier(
						migrationsTable,
					)
				} ("hash", "created_at", "name") 
				values (${migration.hash}, ${migration.folderMillis}, ${migration.name})`,
			);

			return;
		}

		const migrationsToRun = getMigrationsToRun({
			localMigrations: migrations,
			dbMigrations,
		});
		await session.transaction(async (tx) => {
			for await (const migration of migrationsToRun) {
				for (const stmt of migration.sql) {
					await tx.execute(sql.raw(stmt));
				}
				await tx.execute(
					sql`insert into ${sql.identifier(migrationsSchema)}.${
						sql.identifier(
							migrationsTable,
						)
					} ("hash", "created_at", "name") values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`,
				);
			}
		});
	}

	escapeName(name: string): string {
		return escapeCockroachName(name);
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
		useSelectionCastCodecs,
	}: CockroachDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: !useSelectionCastCodecs, table })
			}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`${withSql}delete from ${table}${whereSql}${returningSql}`;
	}

	buildUpdateSet(table: CockroachTable, set: UpdateSet): SQL {
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
		useSelectionCastCodecs,
	}: CockroachUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const tableName = table[CockroachTable.Symbol.Name];
		const tableSchema = table[CockroachTable.Symbol.Schema];
		const origTableName = table[CockroachTable.Symbol.OriginalName];
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
		{ isSingleTable = false, ignoreCastCodecs = false, table }: {
			isSingleTable?: boolean;
			ignoreCastCodecs?: boolean;
			table?: CockroachTable | CockroachViewBase | SQL | Subquery;
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
			const override = codecOverride as CockroachType | undefined;

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
		joins: CockroachSelectJoinConfig[] | undefined,
	): SQL | undefined {
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

			if (is(table, CockroachTable)) {
				const tableName = table[CockroachTable.Symbol.Name];
				const tableSchema = table[CockroachTable.Symbol.Schema];
				const origTableName = table[CockroachTable.Symbol.OriginalName];
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
		table: SQL | Subquery | CockroachViewBase | CockroachTable | undefined,
	): SQL | Subquery | CockroachViewBase | CockroachTable | undefined {
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
		useSelectionCastCodecs,
	}: CockroachSelectConfig): SQL {
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
			table,
			ignoreCastCodecs: !useSelectionCastCodecs || setOperators.length > 0,
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

		const offsetSql = offset === undefined ? undefined : sql` offset ${offset}`;

		const lockingClauseSql = sql.empty();
		if (lockingClause) {
			const clauseSql = sql` for ${new StringChunk(lockingClause.strength)}`;
			if (lockingClause.config.of) {
				clauseSql.append(
					sql` of ${
						sql.join(
							Array.isArray(lockingClause.config.of)
								? lockingClause.config.of
								: [lockingClause.config.of],
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
			sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}${lockingClauseSql}`;

		if (setOperators.length > 0) {
			return this.buildSetOperations(finalQuery, setSelection!, useSelectionCastCodecs, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		outputSelection: SelectedFieldsOrdered,
		useSelectionCastCodecs: boolean | undefined,
		setOperators: CockroachSelectConfig['setOperators'],
	): SQL {
		const lastIdx = setOperators.length - 1;
		let tailSql: SQL | undefined;

		for (let i = 0; i <= lastIdx; ++i) {
			const setOperator = setOperators[i]!;

			const hoistTail = useSelectionCastCodecs && i === lastIdx;
			leftSelect = this.buildSetOperationQuery({ leftSelect, setOperator, omitTail: hoistTail });
			if (hoistTail) tailSql = this.buildSetOperationTail(setOperator);
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
		} from (${leftSelect}) ${sql.identifier('drizzle_union')}${tailSql}`;
	}

	buildSetOperationQuery({
		leftSelect,
		setOperator,
		omitTail,
	}: {
		leftSelect: SQL;
		setOperator: CockroachSelectConfig['setOperators'][number];
		omitTail?: boolean;
	}): SQL {
		const { type, isAll, rightSelect } = setOperator;
		const leftChunk = sql`(${leftSelect.getSQL()}) `;
		const rightChunk = sql`(${rightSelect.getSQL()})`;

		const operatorChunk = new StringChunk(`${type} ${isAll ? 'all ' : ''}`);
		const tailSql = omitTail ? undefined : this.buildSetOperationTail(setOperator);

		return sql`${leftChunk}${operatorChunk}${rightChunk}${tailSql}`;
	}

	buildSetOperationTail(
		{ orderBy, limit, offset }: CockroachSelectConfig['setOperators'][number],
	): SQL | undefined {
		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: (SQL<unknown> | Name)[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid Sql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const singleOrderBy of orderBy) {
				if (is(singleOrderBy, CockroachColumn)) {
					orderByValues.push(sql.identifier(singleOrderBy.name));
				} else if (is(singleOrderBy, SQL)) {
					orderByValues.push(sql`${unqualifyColumns(singleOrderBy)}`);
				} else {
					orderByValues.push(sql`${singleOrderBy}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, commonStringChunks[', '])}`;
		}

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const offsetSql = offset === undefined ? undefined : sql` offset ${offset}`;

		if (orderBySql === undefined && limitSql === undefined && offsetSql === undefined) return undefined;

		return sql`${orderBySql}${limitSql}${offsetSql}`;
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
	}: CockroachInsertConfig): SQL {
		const columns: Record<string, CockroachColumn> = table[Table.Symbol.Columns];

		const colEntries: [string, CockroachColumn][] = columnList
			? columnList.map((name) => [name, columns[name]!])
			: Object.entries(columns);
		const colEntriesFiltered: [string, CockroachColumn][] = select && !is(valuesOrSelect, SQL)
			? Object
				.keys((valuesOrSelect as TypedQueryBuilder<any>).getSelectedFields())
				.map((key) => [key, columns[key]] as [string, CockroachColumn])
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
			valuesSqlList = [(valuesOrSelect as AnyCockroachSelectQueryBuilder | SQL).getSQL()];
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
						// eslint-disable-next-line unicorn/no-negated-condition
						if (col.defaultFn !== undefined) {
							cells[writeIdx++] = col.defaultFn();
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (!col.default && col.onUpdateFn !== undefined) {
							cells[writeIdx++] = col.onUpdateFn();
						} else {
							cells[writeIdx++] = commonStringChunks['default'];
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

		const onConflictSql = onConflict
			? sql` on conflict ${onConflict}`
			: undefined;

		return sql`${withSql}insert into ${table} ${insertOrder} ${valuesSql}${onConflictSql}${returningSql}`;
	}

	buildRefreshMaterializedViewQuery({
		view,
		concurrently,
		withNoData,
	}: {
		view: CockroachMaterializedView;
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

	buildRelationalQuery(
		config: Omit<BuildRelationalQueryConfig, 'through'>,
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
		through,
		nested,
		withSubqueries,
		strategy,
	}: BuildRelationalQueryConfig, collectTo: SQLChunk[]): BuildRelationalQueryResult['selection'] {
		const selection: BuildRelationalQueryResult['selection'] = [];
		const isSingle = mode === 'first';
		const params = config === true ? undefined : config;
		const currentPath = errorPath ?? '';
		const currentDepth = depth ?? 0;
		const isOptimized = (currentDepth ? strategy : params?.strategy) !== 'basic';
		const collector: RelationalWithSubqueries = withSubqueries ?? { subqueries: new Map() };
		if (!currentDepth) {
			collectSubqueryAndUsedTables(collector, table);
			table = aliasedTable(table, `d${currentDepth}`);
		}
		const tableRef = table[Qualifier];

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

		const { sql: where } = relationalQueryWhereToSQL(
			table,
			params,
			tableConfig.relations,
			schema,
			collector,
			relationWhere,
		);
		const order = params?.orderBy
			? relationsOrderToSQL(table, params.orderBy, tableConfig.relations, schema, collector)
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
			tableRef,
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
			if (!tableConfig.relations[k]) {
				throw new DrizzleError({ message: `Unknown relation "${tableConfig.name}" -> "${k}"` });
			}

			const key = sql.identifier(k);
			if (selected++) collectTo.push(commonStringChunks[', ']);
			collectTo.push(key, rqbChunks.relationField, key);
		}

		if (!selected) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}

		// Optimize slow queries caused by planner applying pagination or filters after building relations
		// `limit` and `offset` aren't pushed below lateral joins: relations would get built for more rows than
		// the query returns, filtered or not, sorted or not.
		// Limiting the table in a derived table first restricts the joins to the rows that are actually returned.
		// Nested relations are only handled when sorted or skipped: an unordered `limit`, the one of single
		// relations included, may get planned noticeably worse there
		const isLimitedFirst = offset !== undefined
			|| (limit !== undefined && (!currentDepth || !!order));
		const isWrapped = withKeys.length > 0 && isOptimized && isLimitedFirst;

		collectTo.push(commonStringChunks[' from ']);
		if (isWrapped) collectTo.push(commonStringChunks['(select '], tableRef, commonStringChunks['.* from ']);
		getTableAsAliasSQL(table, collectTo);
		if (through) {
			collectTo.push(commonStringChunks[' inner join ']);
			getTableAsAliasSQL(through.table, collectTo);
			collectTo.push(commonStringChunks[' on '], ...through.condition);
		}
		if (isWrapped) {
			if (where) collectTo.push(commonStringChunks[' where '], ...where);
			if (order) collectTo.push(commonStringChunks[' order by '], ...order);
			if (limit !== undefined) collectTo.push(commonStringChunks[' limit '], limit as SQLChunk);
			if (offset !== undefined) collectTo.push(commonStringChunks[' offset '], offset as SQLChunk);
			collectTo.push(commonStringChunks[') as '], tableRef);
		}

		for (const k of withKeys) {
			const join = withParam![k]!;
			const relation = tableConfig.relations[k]!;
			const isSingle = relation.relationType === 'one';
			collectSubqueryAndUsedTables(collector, relation.targetTable);
			collectSubqueryAndUsedTables(collector, relation.throughTable);

			const targetTable = aliasedTable(relation.targetTable, `d${currentDepth + 1}`);
			const throughTable = relation.throughTable
				? (aliasedTable(relation.throughTable, `tr${currentDepth}`))
				: undefined;

			const { filter, joinCondition } = relationToSQL(relation, table, targetTable, throughTable);

			collectTo.push(isSingle ? rqbChunks.joinOne : rqbChunks.joinMany);
			const innerSelection = this.collectRelationalQuery({
				table: targetTable,
				mode: isSingle ? 'first' : 'many',
				schema,
				queryConfig: join as DBQueryConfigRoot,
				tableConfig: schema[relation.targetTableName]!,
				relationWhere: filter,
				errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
				depth: currentDepth + 1,
				withSubqueries: collector,
				strategy: currentDepth ? strategy : params?.strategy,
				through: throughTable ? { table: throughTable, condition: joinCondition! } : undefined,
				nested: true,
			}, collectTo);
			collectTo.push(rqbChunks.joinClose, sql.identifier(k), rqbChunks.onTrue);

			selection.push({
				field: targetTable,
				fieldType: 'Nested',
				key: k,
				selection: innerSelection,
				isArray: !isSingle,
				isOptional: ((relation as AnyOne).optional ?? false)
					|| (join !== true && !!(join as Exclude<typeof join, boolean | undefined>).where),
			});
		}

		if (isWrapped) {
			if (order) collectTo.push(commonStringChunks[' order by '], ...order);
		} else {
			if (where) collectTo.push(commonStringChunks[' where '], ...where);
			if (order) collectTo.push(commonStringChunks[' order by '], ...order);
			if (limit !== undefined) collectTo.push(commonStringChunks[' limit '], limit as SQLChunk);
			if (offset !== undefined) collectTo.push(commonStringChunks[' offset '], offset as SQLChunk);
		}

		if (withIdx !== -1) collectTo[withIdx] = this.buildWithCTE([...collector.subqueries.values()]);

		return selection;
	}
}
