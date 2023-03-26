import type { ColumnType } from 'kysely';
import type { InferModel, Table } from '~/table';
import type { Assume, Simplify } from '~/utils';

export type Kyselify<T extends Table> = Simplify<
	{
		[Key in keyof T['_']['columns']]: ColumnType<
			InferModel<
				T,
				'select',
				{ dbColumnNames: true }
			>[Assume<Key, keyof InferModel<T, 'select', { dbColumnNames: true }>>],
			InferModel<
				T,
				'insert',
				{ dbColumnNames: true }
			>[Assume<Key, keyof InferModel<T, 'insert', { dbColumnNames: true }>>],
			InferModel<
				T,
				'insert',
				{ dbColumnNames: true }
			>[Assume<Key, keyof InferModel<T, 'insert', { dbColumnNames: true }>>]
		>;
	}
>;
