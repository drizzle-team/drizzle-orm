import { int, serial } from '~/mysql-core/columns/index.ts';
import { mysqlTable } from '~/mysql-core/table.ts';

const test1 = mysqlTable('test1_table', {
	id: serial('id').primaryKey(),
	test2Id: int('test2_id').references(() => test2.id),
});

const test1Id = int('test1_id').references(() => test1.id);

const test2 = mysqlTable('test2_table', {
	id: serial('id').primaryKey(),
	test1Id,
});
