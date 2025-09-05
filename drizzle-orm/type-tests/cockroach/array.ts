import { type Equal, Expect } from 'type-tests/utils.ts';
import { cockroachTable, int4 } from '~/cockroach-core/index.ts';
import type { Column } from '~/column.ts';

{
	const table = cockroachTable('table', {
		a: int4('a').array().notNull(),
	});
	Expect<
		Equal<
			// @ts-ignore - TODO: Remake type checks for new columns
			Column<
				{
					name: 'a';
					tableName: 'table';
					dataType: 'number';
					columnType: 'CockroachInteger';
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
