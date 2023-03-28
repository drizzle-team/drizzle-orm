import type { Knex as KnexType } from 'knex';
import type { InferModel, Table } from '~/table';

declare module 'knex/types/tables' {
	export type Knexify<T extends Table> = KnexType.CompositeTableType<
		InferModel<T, 'select', { dbColumnNames: true }>,
		InferModel<T, 'insert', { dbColumnNames: true }>
	>;
}
