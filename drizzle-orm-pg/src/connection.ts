import { Column, Connector, Dialect, Driver, Session, sql, Table } from 'drizzle-orm';
import { Name, SQL, SQLResponse, SQLSourceParam } from 'drizzle-orm/sql';
import { tableColumns, TableName, tableName } from 'drizzle-orm/utils';
import { Pool, QueryResult } from 'pg';

import { AnyPgColumn } from './columns';
import { PgSelectFields, PgTableOperations } from './operations';
import { AnyPgInsertConfig, AnyPgSelectConfig, PgDeleteConfig, PgUpdateConfig } from './queries';
import { AnyPgSQL } from './sql';
import { AnyPgTable } from './table';
import { getTableColumns } from './utils';

export type PgDriverParam = string | number | boolean | null | Record<string, unknown> | Date;

export interface PgSession extends Session<PgDriverParam, Promise<QueryResult>> {}

export class PgSessionDefault implements PgSession {
	constructor(private pool: Pool) {}

	public async query(query: string, params: unknown[]): Promise<QueryResult> {
		return this.pool.query(query, params);
	}
}

export class PgDriver implements Driver<PgSession> {
	constructor(private pool: Pool) {}

	async connect(): Promise<PgSession> {
		return new PgSessionDefault(this.pool);
	}
}

export class PgDialect<TDBSchema extends Record<string, AnyPgTable>>
	implements Dialect<PgSession, PGDatabase<TDBSchema>>
{
	constructor(private schema: TDBSchema) {}

	createDB(session: PgSession): PGDatabase<TDBSchema> {
		return this.createPGDB(this.schema, session);
	}

	createPGDB(schema: TDBSchema, session: PgSession): PGDatabase<TDBSchema> {
		return Object.fromEntries(
			Object.entries(schema).map(([tableName, table]) => {
				return [
					tableName,
					new PgTableOperations(table, session, this as unknown as AnyPgDialect),
				];
			}),
		) as unknown as PGDatabase<TDBSchema>;
	}

	public escapeName(name: string): string {
		return `"${name}"`;
	}

	public escapeParam(num: number): string {
		return `$${num}`;
	}

	public buildDeleteQuery<TTable extends AnyPgTable>({
		table,
		where,
		returning,
		returningFields,
	}: PgDeleteConfig<TTable>): AnyPgSQL<TableName<TTable>> {
		const returningStatement = returningFields
			? sql`returning ${
					returningFields
						? sql.fromList(this.prepareTableFieldsForQuery(returningFields))
						: undefined
			  }`
			: returning
			? sql`returning ${sql.fromList(this.prepareTableFieldsForQuery(table[tableColumns]))}`
			: undefined;

		return sql<TableName<TTable>, SQLSourceParam[]>`delete from ${table} ${
			where ? sql`where ${where}` : undefined
		} ${returningStatement}`;
	}

	public buildUpdateQuery<TTable extends AnyPgTable>({
		table,
		set,
		where,
		returning,
		returningFields,
	}: PgUpdateConfig<TTable>): SQL<TableName<TTable>, PgDriverParam> {
		const setSize = Object.keys(set).length;
		const setSql = sql.fromList(
			Object.entries(set)
				.map(([colName, value], i) => {
					const col = getTableColumns(table)[colName]!;
					const res = sql`${new Name(col.name)} = ${value}`;
					if (i < setSize - 1) {
						return [res, sql.raw(', ')];
					}
					return [res];
				})
				.flat(1),
		);

		const returningStatement = returningFields
			? sql`returning ${
					returningFields
						? sql.fromList(this.prepareTableFieldsForQuery(returningFields))
						: undefined
			  }`
			: returning
			? sql`returning ${sql.fromList(this.prepareTableFieldsForQuery(table[tableColumns]))}`
			: undefined;

		return sql`update ${table} set ${setSql} ${
			where ? sql`where ${where}` : undefined
		} ${returningStatement}` as SQL<TableName<TTable>, PgDriverParam>;
	}

	private prepareTableFieldsForQuery(
		fields: PgSelectFields<TableName<AnyPgTable>> | undefined,
	): SQLSourceParam[] {
		let sqlFieldsList: SQLSourceParam[] = [];
		if (fields) {
			Object.values(fields).forEach((field, i) => {
				if (field instanceof SQLResponse) {
					sqlFieldsList.push(field.sql);
				} else if (field instanceof Column) {
					const columnTableName = field.table[tableName];
					sqlFieldsList.push(
						sql`${field} as ${sql.raw(
							this.escapeName(`${columnTableName}_${field.name}`),
						)}`,
					);
				}

				if (i < Object.values(fields).length - 1) {
					sqlFieldsList.push(sql`, `);
				}
			});
		}
		return sqlFieldsList;
	}

	public buildSelectQuery({
		fields,
		where,
		table,
		joins,
		distinct,
		orderBy,
		limit,
		offset,
	}: AnyPgSelectConfig): AnyPgSQL {
		let sqlFields: AnyPgSQL;

		const sqlFieldsList: SQLSourceParam[] =
			typeof fields === 'undefined'
				? this.prepareTableFieldsForQuery(table[tableColumns])
				: this.prepareTableFieldsForQuery(fields);

		const joinsArray: AnyPgSQL[] = [];
		if (joins) {
			const joinKeys = Object.keys(joins);

			joinKeys.forEach((tableAlias, index) => {
				const joinMeta = joins[tableAlias]!;
				joinsArray.push(
					sql<string, unknown[]>`${sql.raw(joinMeta.joinType!)} ${joinMeta.table} ${
						joinMeta.alias
					} on ${joinMeta.on}`,
				);
				if (index < joinKeys.length - 1) {
					joinsArray.push(sql` `);
				}

				if (sqlFieldsList.length > 0) {
					sqlFieldsList.push(sql`, `);
				}

				sqlFieldsList.push(...this.prepareTableFieldsForQuery(joinMeta.columns));
			});
		}

		sqlFields = sql.fromList(sqlFieldsList);

		if (joinsArray.length === 0 && typeof fields === 'undefined') {
			sqlFields = sql.raw('*');
		}

		const orderByList: AnyPgSQL<string>[] = [];
		orderBy.forEach((orderByValue, index) => {
			orderByList.push(orderByValue);

			if (index < orderBy.length - 1) {
				orderByList.push(sql`, `);
			}
		});

		return sql<string, unknown[]>`select ${sqlFields} from ${table} ${sql.fromList(
			joinsArray,
		)} ${where ? sql`where ${where}` : undefined} ${
			orderBy.length > 0 ? sql.raw('order by') : undefined
		} ${sql.fromList(orderByList)} ${limit ? sql.raw(`limit ${limit}`) : undefined} ${
			offset ? sql.raw(`offset ${offset}`) : undefined
		}`;
	}

	public buildInsertQuery({
		table,
		values,
		onConflict,
		returning,
		returningFields,
	}: AnyPgInsertConfig): AnyPgSQL {
		const joinedValues: (unknown | AnyPgSQL)[][] = [];
		const columns: Record<string, AnyPgColumn> = getTableColumns(table);

		const columnKeys = Object.keys(columns);
		const insertOrder = Object.values(columns).map((column) => new Name(column.name));

		values.forEach((value) => {
			const valueList: (unknown | AnyPgSQL)[] = [];
			columnKeys.forEach((key) => {
				const colValue = value[key];
				if (typeof colValue === 'undefined') {
					valueList.push(sql`default`);
				} else {
					valueList.push(colValue);
				}
			});
			joinedValues.push(valueList);
		});

		const returningStatement = returningFields
			? sql`returning ${
					returningFields
						? sql.fromList(this.prepareTableFieldsForQuery(returningFields))
						: undefined
			  }`
			: returning
			? sql`returning ${sql.fromList(this.prepareTableFieldsForQuery(table[tableColumns]))}`
			: undefined;

		return sql<string, unknown[]>`insert into ${table} ${insertOrder} values ${
			joinedValues.length === 1 ? joinedValues[0] : joinedValues
		} ${onConflict ? sql`on conflict ${onConflict}` : undefined} ${returningStatement}`;
	}

	public prepareSQL(sql: SQL<string, PgDriverParam>): [string, PgDriverParam[]] {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
		});
	}
}

export type AnyPgDialect = PgDialect<Record<string, AnyPgTable>>;

export type PGDatabase<TSchema extends Record<string, AnyPgTable>> = {
	[TTableName in keyof TSchema & string]: TSchema[TTableName] extends AnyPgTable<TTableName>
		? PgTableOperations<TSchema[TTableName]>
		: never;
};

export class PgConnector<TDBSchema extends Record<string, AnyPgTable>>
	implements Connector<PgSession, PGDatabase<TDBSchema>>
{
	dialect: Dialect<PgSession, PGDatabase<TDBSchema>>;
	driver: Driver<PgSession>;

	constructor(pool: Pool, dbSchema: TDBSchema) {
		this.dialect = new PgDialect(dbSchema);
		this.driver = new PgDriver(pool);
	}
}
