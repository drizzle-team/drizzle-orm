import { type Equal, Expect } from 'type-tests/utils.ts';
import type { Column } from '~/column.ts';
import { gelTable, integer } from '~/gel-core/index.ts';

{
	const table = gelTable('table', {
		a: integer('a').array().notNull(),
	});
	Expect<
		Equal<
			Column<
				{
					name: 'a';
					tableName: 'table';
					dataType: 'number';
					columnType: 'GelInteger';
					data: number;
					driverParam: number;
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
