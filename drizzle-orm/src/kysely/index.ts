import type { ColumnType } from 'kysely';
import type { InferModel, MapColumnName, Table } from '~/table';
import type { Simplify } from '~/utils';

export type Kyselify<T extends Table> = Simplify<
	{
		[Key in keyof T['_']['columns'] & string as MapColumnName<Key, T['_']['columns'][Key], true>]: ColumnType<
			// select
			InferModel<T, 'select', { dbColumnNames: true }>[MapColumnName<Key, T['_']['columns'][Key], true>],
			// insert
			MapColumnName<Key, T['_']['columns'][Key], true> extends keyof InferModel<
				T,
				'insert',
				{ dbColumnNames: true }
			> ? InferModel<T, 'insert', { dbColumnNames: true }>[MapColumnName<Key, T['_']['columns'][Key], true>]
				: never,
			// update
			MapColumnName<Key, T['_']['columns'][Key], true> extends keyof InferModel<
				T,
				'insert',
				{ dbColumnNames: true }
			> ? InferModel<T, 'insert', { dbColumnNames: true }>[MapColumnName<Key, T['_']['columns'][Key], true>]
				: never
		>;
	}
>;
