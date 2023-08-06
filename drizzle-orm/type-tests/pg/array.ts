import { type Equal, Expect } from 'type-tests/utils';
import { type Column } from '~/column';
import { integer, pgTable } from '~/pg-core';

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
				}
			>,
			typeof table['a']['_']['baseColumn']
		>
	>;
}
