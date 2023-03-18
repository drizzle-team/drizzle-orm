import type { ColumnType } from 'kysely';
import type { AnyMySqlTable, MySqlTableWithColumns } from '~/mysql-core';
import type { InferModel as InferMySqlModel } from '~/mysql-core';
import type { AnyPgTable, InferModel as InferPgModel, PgTableWithColumns } from '~/pg-core';
import type { AnySQLiteTable, InferModel as InferSqliteModel } from '~/sqlite-core';
import type { SQLiteTableWithColumns } from '~/sqlite-core';
import type { Table } from '~/table';
import type { Assume } from '~/utils';

type KyselifyPg<T extends AnyPgTable> = T extends PgTableWithColumns<infer TConfig> ? {
		[Key in keyof TConfig['columns']]: ColumnType<
			InferPgModel<T>[Key],
			InferPgModel<T, 'insert'>[Assume<Key, keyof InferPgModel<T, 'insert'>>],
			InferPgModel<T, 'insert'>[Assume<Key, keyof InferPgModel<T, 'insert'>>]
		>;
	}
	: never;

type KyselifyMySql<T extends AnyMySqlTable> = T extends MySqlTableWithColumns<infer TConfig> ? {
		[Key in keyof TConfig['columns']]: ColumnType<
			InferMySqlModel<T>[Key],
			InferMySqlModel<T, 'insert'>[Assume<Key, keyof InferMySqlModel<T, 'insert'>>],
			InferMySqlModel<T, 'insert'>[Assume<Key, keyof InferMySqlModel<T, 'insert'>>]
		>;
	}
	: never;

type KyselifySQLite<T extends AnySQLiteTable> = T extends SQLiteTableWithColumns<infer TConfig> ? {
		[Key in keyof TConfig['columns']]: ColumnType<
			InferSqliteModel<T>[Key],
			InferSqliteModel<T, 'insert'>[Assume<Key, keyof InferSqliteModel<T, 'insert'>>],
			InferSqliteModel<T, 'insert'>[Assume<Key, keyof InferSqliteModel<T, 'insert'>>]
		>;
	}
	: never;

export type Kyselify<T extends Table> = T extends AnyPgTable ? KyselifyPg<T>
	: T extends AnyMySqlTable ? KyselifyMySql<T>
	: T extends AnySQLiteTable ? KyselifySQLite<T>
	: never;
