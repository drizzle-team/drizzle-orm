import { InferColumnType } from 'drizzle-orm';
import { SelectFields } from 'drizzle-orm/operations';
import { AnySQLResponse, SQLResponse } from 'drizzle-orm/sql';
import { tableColumns, TableName } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyPgColumn } from './columns/common';
import { AnyPgDialect, PgDriverParam, PgSession } from './connection';
import { PgDelete, PgInsert, PgSelect, PgUpdate } from './queries';
import { AnyPgSQL } from './sql';
import { AnyPgTable, InferType } from './table';

export type PgSelectFields<TTableName extends string> = SelectFields<TTableName, PgDriverParam>;

export type PgSelectFieldsOrdered = { name: string; column: AnyPgColumn | AnySQLResponse }[];

export type PartialSelectResult<
	TTableName extends string,
	TSelectedFields extends PgSelectFields<TTableName>,
> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: TSelectedFields[Key] extends AnyPgColumn<TTableName>
			? InferColumnType<TSelectedFields[Key]>
			: TSelectedFields[Key] extends SQLResponse<string, infer TValue> ? TValue
			: any;
	}
>;

export class PgTableOperations<TTable extends AnyPgTable> {
	constructor(
		protected table: TTable,
		private session: PgSession,
		private dialect: AnyPgDialect,
	) {}

	select(): PgSelect<TTable, InferType<TTable>>;
	select<TSelectedFields extends PgSelectFields<TableName<TTable>>>(
		fields: TSelectedFields,
	): PgSelect<TTable, PartialSelectResult<TableName<TTable>, TSelectedFields>>;
	select(fields?: PgSelectFields<TableName<TTable>>): PgSelect<TTable, any> {
		const fieldsOrdered = this.dialect.orderSelectedFields(fields ?? this.table[tableColumns]);
		return new PgSelect(this.table, fieldsOrdered, this.session, this.dialect);
	}

	update(): Pick<PgUpdate<TTable>, 'set'> {
		return new PgUpdate(this.table, this.session, this.dialect);
	}

	insert(values: InferType<TTable, 'insert'> | InferType<TTable, 'insert'>[]): PgInsert<TTable> {
		return new PgInsert(
			this.table,
			Array.isArray(values) ? values : [values],
			this.session,
			this.dialect,
		);
	}

	delete(): PgDelete<TTable> {
		return new PgDelete(this.table, this.session, this.dialect);
	}
}

export const rawQuery = Symbol('raw');

export type DB<TDBSchema extends Record<string, AnyPgTable>> =
	& {
		[TTable in keyof TDBSchema & string]: PgTableOperations<TDBSchema[TTable]>;
	}
	& {
		[rawQuery]: (query: AnyPgSQL) => Promise<unknown>;
	};

// export class PgJson<TTable extends string, TData extends ParamValue = ParamValue> extends PgColumn<
// 	TTable,
// 	TData
// > {
// 	getSQLType(): string {
// 		return 'json';
// 	}
// }

// export class PgJsonb<TTable extends string, TData extends ParamValue = ParamValue> extends PgColumn<
// 	TTable,
// 	TData
// > {
// 	getSQLType(): string {
// 		return 'jsonb';
// 	}
// }

// export class PgBoolean<TTable extends string> extends PgColumn<TTable, boolean> {
// 	getSQLType(): string {
// 		return 'boolean';
// 	}
// }

// export class PgDate<TTable extends string> extends PgColumn<TTable, Date> {
// 	getSQLType(): string {
// 		return 'date';
// 	}
// }

// export class PgTimestamp<TTable extends string> extends PgColumn<TTable, Date> {
// 	getSQLType(): string {
// 		return 'timestamp';
// 	}
// }

// export class PgTimestampTz<TTable extends string> extends PgColumn<TTable, Date> {
// 	getSQLType(): string {
// 		return 'timestamp with time zone';
// 	}
// }

// export class PgTime<TTable extends string> extends PgColumn<TTable, Date> {
// 	getSQLType(): string {
// 		return 'time';
// 	}
// }
