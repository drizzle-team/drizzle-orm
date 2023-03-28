import { type AnyPgColumn, integer, serial } from '~/pg-core/columns';
import { pgTable } from '~/pg-core/table';

{
	const test1 = pgTable('test1_table', {
		id: serial('id').primaryKey(),
		test2Id: integer('test2_id').references(() => test2.id),
	});

	const test1Id = integer('test1_id').references(() => test1.id);

	const test2 = pgTable('test2_table', {
		id: serial('id').primaryKey(),
		test1Id,
	});
}

{
	const test1 = pgTable('test1_table', {
		id: serial('id').primaryKey(),
		test2Id: integer('test2_id').references((): AnyPgColumn => test2.id),
	});

	const test2 = pgTable('test2_table', {
		id: serial('id').primaryKey(),
		test1Id: integer('test1_id').references(() => test1.id),
	});
}
