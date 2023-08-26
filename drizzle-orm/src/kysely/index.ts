import type { ColumnType } from 'kysely';
import type { InferInsertModel, InferSelectModel, MapColumnName, Table } from '~/table.ts';
import type { Simplify } from '~/utils.ts';

export type Kyselify<T extends Table> = Simplify<
	{
		[Key in keyof T['_']['columns'] & string as MapColumnName<Key, T['_']['columns'][Key], true>]: ColumnType<
			// select
			InferSelectModel<T, { dbColumnNames: true }>[MapColumnName<Key, T['_']['columns'][Key], true>],
			// insert
			MapColumnName<Key, T['_']['columns'][Key], true> extends keyof InferInsertModel<
				T,
				{ dbColumnNames: true }
			> ? InferInsertModel<T, { dbColumnNames: true }>[MapColumnName<Key, T['_']['columns'][Key], true>]
				: never,
			// update
			MapColumnName<Key, T['_']['columns'][Key], true> extends keyof InferInsertModel<
				T,
				{ dbColumnNames: true }
			> ? InferInsertModel<T, { dbColumnNames: true }>[MapColumnName<Key, T['_']['columns'][Key], true>]
				: never
		>;
	}
>;
