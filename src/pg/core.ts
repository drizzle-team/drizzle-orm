// import { Pool, QueryResult } from 'pg';
import {
	Session,
	DriverResponse,
	UpdateConfig,
	Return,
	InferType,
	Column,
	SelectConfig,
	SelectFields,
	table,
	AnyTable,
	ColumnBuilder,
	AnyColumn,
	TableName,
} from '../core';
import { SQL, sql, raw as rawSql, Primitive } from '../sql';

interface Pool {}

interface QueryResult<T> {}

export class PgDialect {
	public escapeName(name: string): string {
		return `"${name}"`;
	}

	public escapeParam(num: number): string {
		return `$${num}`;
	}

	public buildUpdateQuery({
		table,
		set,
		where,
		returning,
	}: PgUpdateConfig): SQL {
		return sql`update ${table} set ${set} ${
			where ? sql`where ${where}` : undefined
		} ${returning ? rawSql('returning *') : undefined}`;
	}

	public buildSelectQuery({ fields, where, table }: AnyPgSelectConfig): SQL {
		let sqlFields: SQL;
		if (fields) {
			let sqlFieldsList: SQL[] = [];
			Object.values(fields).forEach((field, i) => {
				if (field instanceof SQL) {
					sqlFieldsList.push(field);
				} else if (field instanceof Column) {
					sqlFieldsList.push(sql`${field}`);
				}

				if (i < Object.values(fields).length - 1) {
					sqlFieldsList.push(rawSql(', '));
				}
			});

			sqlFields = sql.fromList(sqlFieldsList);
		} else {
			sqlFields = rawSql('*');
		}

		return sql`select ${sqlFields} from ${table} ${
			where ? sql`where ${where}` : undefined
		}`;
	}

	public prepareSQL(sql: SQL): [string, Primitive[]] {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
		});
	}
}

export class PgSession<
	TDBSchema extends Record<string, AnyTable>,
> extends Session {
	private dialect = new PgDialect();

	constructor(private pool: Pool, private dbSchema: TDBSchema) {
		super();
	}

	public async query(
		query: string,
		params: unknown[],
	): Promise<DriverResponse> {
		console.log({ query, params });
		return {
			rows: [],
			rowCount: 0,
			command: '',
		};
		// const result = await this.pool.query(query);
		// return {
		// 	rows: result.rows,
		// 	rowCount: result.rowCount,
		// 	command: result.command,
		// };
	}
}

class Operations<TTable extends AnyTable> {
	private dialect = new PgDialect();

	constructor(private table: TTable, private session: AnyPgSession) {}

	private map(rows: any[]): InferType<TTable>[] {
		return rows;
	}

	select(fields?: SelectFields<TableName<TTable>>): PgSelect<TTable> {
		return new PgSelect<TTable>(
			this.table,
			fields,
			this.session,
			this.map,
			this.dialect,
		);
	}

	update(): Pick<PgUpdate<TTable>, 'set'> {
		return new PgUpdate(this.table, this.session, this.map, this.dialect);
	}
}

export const raw = Symbol('raw');

export type DB<TDBSchema extends Record<string, AnyTable>> = {
	[TTable in keyof TDBSchema & string]: Operations<TDBSchema[TTable]>;
} & {
	[raw]: (query: SQL) => Promise<unknown>;
};

export function connect<TSchema extends Record<string, AnyTable>>(
	pool: Pool,
	dbSchema: TSchema,
) {
	const session = new PgSession(pool, dbSchema);
	return Object.fromEntries(
		Object.entries(dbSchema).map(([tableName, table]) => {
			return [tableName, new Operations(table, session)];
		}),
	) as DB<TSchema>;
}

export type AnyPgSession = PgSession<any>;

export interface PgUpdateConfig extends UpdateConfig {
	returning?: boolean;
}

export interface PgSelectConfig<TTable extends string>
	extends SelectConfig<AnyTable> {}

export type AnyPgSelectConfig = SelectConfig<AnyTable>;

export interface PgReturn extends Return {
	num: number;
}

export class PgUpdate<TTable extends AnyTable, TReturn = QueryResult<any>> {
	private fields: PgUpdateConfig = {} as PgUpdateConfig;

	constructor(
		private table: TTable,
		private session: AnyPgSession,
		private mapper: (rows: any[]) => InferType<TTable>[],
		private dialect: PgDialect,
	) {
		this.fields.table = table;
	}

	public set(
		values: SQL<TableName<TTable>>,
	): Pick<this, 'where' | 'returning' | 'execute'> {
		this.fields.set = values;
		return this;
	}

	public where(
		where: SQL<TableName<TTable>>,
	): Pick<this, 'returning' | 'execute'> {
		this.fields.where = where;
		return this;
	}

	public returning(): Pick<PgUpdate<TTable, InferType<TTable>>, 'execute'> {
		this.fields.returning = true;
		return this as unknown as Pick<
			PgUpdate<TTable, InferType<TTable>>,
			'execute'
		>;
	}

	public async execute(): Promise<TReturn> {
		const query = this.dialect.buildUpdateQuery(this.fields);
		const [sql, params] = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		// mapping from driver response to return type
		return this.mapper(result.rows) as unknown as TReturn;
	}
}

export class PgSelect<TTable extends AnyTable, TReturn = QueryResult<any>> {
	private config: SelectConfig<TTable> = {} as SelectConfig<TTable>;

	constructor(
		private table: TTable,
		private fields: SelectFields<TableName<TTable>> | undefined,
		private session: AnyPgSession,
		private mapper: (rows: any[]) => InferType<TTable>[],
		private dialect: PgDialect,
	) {
		this.config.fields = fields;
		this.config.table = table;
	}

	public where(where: SQL<TableName<TTable>>): Pick<this, 'execute'> {
		this.config.where = where;
		return this;
	}

	public execute(): Promise<TReturn> {
		const query = this.dialect.buildSelectQuery(this.config);
		const [sql, params] = this.dialect.prepareSQL(query);
		return this.session.query(sql, params).then((result) => {
			return this.mapper(result.rows) as unknown as TReturn;
		});
	}
}

export abstract class PgColumnBuilder<
	TColumnType extends AnyColumn = AnyColumn,
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> extends ColumnBuilder<TColumnType, TNotNull, TDefault> {}

export abstract class PgColumn<
	TTable extends string,
	TType extends Primitive = Primitive,
	TNotNull extends boolean = boolean,
	TDefaultValue extends boolean = boolean,
> extends Column<TTable, TType, TNotNull, TDefaultValue> {}

export class PgText<TTable extends string> extends PgColumn<TTable, string> {
	getSQLType(): string {
		return 'text';
	}
}

export class PgJson<
	TTable extends string,
	TData extends Primitive = Primitive,
> extends Column<TTable, TData> {
	getSQLType(): string {
		return 'json';
	}
}

export class PgJsonb<
	TTable extends string,
	TData extends Primitive = Primitive,
> extends Column<TTable, TData> {
	getSQLType(): string {
		return 'jsonb';
	}
}

export class PgBoolean<TTable extends string> extends PgColumn<
	TTable,
	boolean
> {
	getSQLType(): string {
		return 'boolean';
	}
}

export class PgDate<TTable extends string> extends PgColumn<TTable, Date> {
	getSQLType(): string {
		return 'date';
	}
}

export class PgTimestamp<TTable extends string> extends PgColumn<TTable, Date> {
	getSQLType(): string {
		return 'timestamp';
	}
}

export class PgTimestampTz<TTable extends string> extends PgColumn<
	TTable,
	Date
> {
	getSQLType(): string {
		return 'timestamp with time zone';
	}
}

export class PgTime<TTable extends string> extends PgColumn<TTable, Date> {
	getSQLType(): string {
		return 'time';
	}
}

export function pgTable<
	TTableName extends string,
	TConfigMap extends Record<string, PgColumnBuilder>,
>(name: TTableName, columns: TConfigMap) {
	return table(name, columns);
}
