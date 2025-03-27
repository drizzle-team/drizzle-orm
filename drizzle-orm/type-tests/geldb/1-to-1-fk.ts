import { type GelColumn, integer } from '~/gel-core/columns/index.ts';
import { gelTable } from '~/gel-core/table.ts';

{
	const test1 = gelTable('test1_table', {
		id: integer('id').primaryKey(),
		test2Id: integer('test2_id').references(() => test2.id),
	});

	const test1Id = integer('test1_id').references(() => test1.id);

	const test2 = gelTable('test2_table', {
		id: integer('id').primaryKey(),
		test1Id,
	});
}

{
	const test1 = gelTable('test1_table', {
		id: integer('id').primaryKey(),
		test2Id: integer('test2_id').references((): GelColumn => test2.id),
	});

	const test2 = gelTable('test2_table', {
		id: integer('id').primaryKey(),
		test1Id: integer('test1_id').references(() => test1.id),
	});
}
