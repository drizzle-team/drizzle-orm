import { type Equal, Expect } from 'type-tests/utils.ts';
import { cockroachdbTable, int4 } from '~/cockroachdb-core/index.ts';
import type { Column } from '~/column.ts';

{
	const table = cockroachdbTable('table', {
		a: int4('a').array().notNull(),
	});
	Expect<
		Equal<
			Column<
				{
					name: 'a';
					tableName: 'table';
					dataType: 'number';
					columnType: 'CockroachDbInteger';
					data: number;
					driverParam: string | number;
					notNull: false;
					hasDefault: false;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
				},
				{},
				{}
			>,
			typeof table['a']['_']['baseColumn']
		>
	>;
}
