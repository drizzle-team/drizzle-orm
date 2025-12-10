import { int } from '~/mssql-core/columns/index.ts';
import { mssqlTable } from '~/mssql-core/table.ts';

const test1 = mssqlTable('test1_table', {
	id: int('id').identity().primaryKey(),
	test2Id: int('test2_id').references(() => test2.id),
});

const test1Id = int('test1_id').references(() => test1.id);

const test2 = mssqlTable('test2_table', {
	id: int('id').identity().primaryKey(),
	test1Id,
});
