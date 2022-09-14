import { integer } from '~/columns';
import { sqliteTable } from '~/table';

const test1 = sqliteTable('test1_table', {
	id: integer('id').primaryKey(),
	test2Id: integer('test2_id').references(() => test2.id),
});

const test1Id = integer('test1_id').references(() => test1.id);

const test2 = sqliteTable('test2_table', {
	id: integer('id').primaryKey(),
	test1Id,
});
