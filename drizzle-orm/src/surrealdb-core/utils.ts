import { Table } from '~/table.ts';
import type { SurrealDBTable } from './table.ts';

export function getTableConfig(table: SurrealDBTable) {
	const columns = Object.values(table[Table.Symbol.Columns]);
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];
	const baseName = table[Table.Symbol.BaseName];

	const extraConfigBuilder = table[Table.Symbol.ExtraConfigBuilder];

	return {
		columns,
		name,
		schema,
		baseName,
		extraConfigBuilder,
	};
}
