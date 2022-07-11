// import { Pool, QueryResult } from 'pg';
import {
	InferType,
	SelectFields,
	UpdateConfig,
	SelectConfig,
	Return,
} from 'drizzle-orm/operations';
import { SQL, Primitive } from 'drizzle-orm/sql';
import { TableName } from 'drizzle-orm/utils';

import { AnyPgTable, PgColumn, AnyPgDialect, PgSession } from '.';

interface QueryResult<T> {}

export class PgTableOperations<TTable extends AnyPgTable = AnyPgTable> {
	constructor(
		private table: TTable,
		private session: AnyPgSession,
		private dialect: AnyPgDialect,
	) {}

	private map(rows: any[]): InferType<TTable>[] {
		return rows;
	}

	select(fields?: SelectFields<TableName<TTable>>): PgSelect<TTable> {
		return new PgSelect<TTable>(this.table, fields, this.session, this.map, this.dialect);
	}

	update(): Pick<PgUpdate<TTable>, 'set'> {
		return new PgUpdate(this.table, this.session, this.map, this.dialect);
	}
}

export const rawQuery = Symbol('raw');

export type DB<TDBSchema extends Record<string, AnyPgTable>> = {
	[TTable in keyof TDBSchema & string]: PgTableOperations<TDBSchema[TTable]>;
} & {
	[rawQuery]: (query: SQL) => Promise<unknown>;
};

export type AnyPgSession = PgSession<any>;

export interface PgUpdateConfig extends UpdateConfig {
	returning?: boolean;
}

export interface PgSelectConfig<TTable extends string> extends SelectConfig<AnyPgTable> {}

export type AnyPgSelectConfig = SelectConfig<AnyPgTable>;

export interface PgReturn extends Return {
	num: number;
}

export class PgUpdate<TTable extends AnyPgTable, TReturn = QueryResult<any>> {
	private fields: PgUpdateConfig = {} as PgUpdateConfig;

	constructor(
		private table: TTable,
		private session: AnyPgSession,
		private mapper: (rows: any[]) => InferType<TTable>[],
		private dialect: AnyPgDialect,
	) {
		this.fields.table = table;
	}

	public set(values: SQL<TableName<TTable>>): Pick<this, 'where' | 'returning' | 'execute'> {
		this.fields.set = values;
		return this;
	}

	public where(where: SQL<TableName<TTable>>): Pick<this, 'returning' | 'execute'> {
		this.fields.where = where;
		return this;
	}

	public returning(): Pick<PgUpdate<TTable, InferType<TTable>>, 'execute'> {
		this.fields.returning = true;
		return this as unknown as Pick<PgUpdate<TTable, InferType<TTable>>, 'execute'>;
	}

	public async execute(): Promise<TReturn> {
		const query = this.dialect.buildUpdateQuery(this.fields);
		const [sql, params] = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		// mapping from driver response to return type
		return this.mapper(result.rows) as unknown as TReturn;
	}
}

export class PgSelect<TTable extends AnyPgTable, TReturn = QueryResult<any>> {
	private config: SelectConfig<TTable> = {} as SelectConfig<TTable>;

	constructor(
		private table: TTable,
		private fields: SelectFields<TableName<TTable>> | undefined,
		private session: AnyPgSession,
		private mapper: (rows: any[]) => InferType<TTable>[],
		private dialect: AnyPgDialect,
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

export class PgJson<TTable extends string, TData extends Primitive = Primitive> extends PgColumn<
	TTable,
	TData
> {
	getSQLType(): string {
		return 'json';
	}
}

export class PgJsonb<TTable extends string, TData extends Primitive = Primitive> extends PgColumn<
	TTable,
	TData
> {
	getSQLType(): string {
		return 'jsonb';
	}
}

export class PgBoolean<TTable extends string> extends PgColumn<TTable, boolean> {
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

export class PgTimestampTz<TTable extends string> extends PgColumn<TTable, Date> {
	getSQLType(): string {
		return 'timestamp with time zone';
	}
}

export class PgTime<TTable extends string> extends PgColumn<TTable, Date> {
	getSQLType(): string {
		return 'time';
	}
}
