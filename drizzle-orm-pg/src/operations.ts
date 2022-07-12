// import { Pool, QueryResult } from 'pg';
import { InferType, SelectFields } from 'drizzle-orm/operations';
import { SQL, ParamValue } from 'drizzle-orm/sql';
import { TableName } from 'drizzle-orm/utils';

import { PgColumn } from './columns';
import { AnyPgDialect, PgSession } from './connection';
import { PgInsert, PgSelect, PgUpdate } from './queries';
import { AnyPgTable } from './table';

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

	insert(): Pick<PgInsert<TTable>, 'values'> {
		return new PgInsert(this.table, this.session, this.map, this.dialect);
	}
}

export const rawQuery = Symbol('raw');

export type DB<TDBSchema extends Record<string, AnyPgTable>> = {
	[TTable in keyof TDBSchema & string]: PgTableOperations<TDBSchema[TTable]>;
} & {
	[rawQuery]: (query: SQL) => Promise<unknown>;
};

export type AnyPgSession = PgSession<any>;

export class PgJson<TTable extends string, TData extends ParamValue = ParamValue> extends PgColumn<
	TTable,
	TData
> {
	getSQLType(): string {
		return 'json';
	}
}

export class PgJsonb<TTable extends string, TData extends ParamValue = ParamValue> extends PgColumn<
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
