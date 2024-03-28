import { type Equal, Expect } from 'type-tests/utils.ts';
import type { Column } from '~/column.ts';
import { integer, pgTable } from '~/pg-core/index.ts';

{
	const table = pgTable('table', {
		a: integer('a').array().notNull(),
	});
	Expect<
		Equal<
			Column<
				{
					name: 'a';
					tableName: 'table';
					dataType: 'number';
					columnType: 'PgInteger';
					data: number;
					driverParam: string | number;
					notNull: false;
					hasDefault: false;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}
			>,
			typeof table['a']['_']['baseColumn']
		>
	>;
}
