import type { Knex as KnexType } from 'knex';
import type { AnyMySqlTable, InferModel as InferMySqlModel } from '~/mysql-core';
import type { AnyPgTable, InferModel as InferPgModel } from '~/pg-core';
import type { AnySQLiteTable, InferModel as InferSqliteModel } from '~/sqlite-core';
import type { Table } from '~/table';

declare module 'knex/types/tables' {
	type KnexifyPg<T extends AnyPgTable> = KnexType.CompositeTableType<
		InferPgModel<T>,
		InferPgModel<T, 'insert'>
	>;

	type KnexifyMySql<T extends AnyMySqlTable> = KnexType.CompositeTableType<
		InferMySqlModel<T>,
		InferMySqlModel<T, 'insert'>
	>;

	type KnexifySQLite<T extends AnySQLiteTable> = KnexType.CompositeTableType<
		InferSqliteModel<T>,
		InferSqliteModel<T, 'insert'>
	>;

	export type Knexify<T extends Table> = T extends AnyPgTable ? KnexifyPg<T>
		: T extends AnyMySqlTable ? KnexifyMySql<T>
		: T extends AnySQLiteTable ? KnexifySQLite<T>
		: never;
}
