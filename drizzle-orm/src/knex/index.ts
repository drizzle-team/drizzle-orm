import type { Knex as KnexType } from 'knex';
import type { InferInsertModel, InferSelectModel, Table } from '~/table.ts';

declare module 'knex/types/tables.ts' {
	export type Knexify<T extends Table> =
		& KnexType.CompositeTableType<
			InferSelectModel<T, { dbColumnNames: true }>,
			InferInsertModel<T, { dbColumnNames: true }>
		>
		& {};
}
