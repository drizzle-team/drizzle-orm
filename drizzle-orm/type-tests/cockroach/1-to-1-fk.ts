import { type CockroachColumn, int4 } from '~/cockroach-core/columns/index.ts';
import { cockroachTable } from '~/cockroach-core/table.ts';

{
	const test1 = cockroachTable('test1_table', {
		id: int4('id').primaryKey(),
		test2Id: int4('test2_id').references(() => test2.id),
	});

	const test1Id = int4('test1_id').references(() => test1.id);

	const test2 = cockroachTable('test2_table', {
		id: int4('id').primaryKey(),
		test1Id,
	});
}

{
	const test1 = cockroachTable('test1_table', {
		id: int4('id').primaryKey(),
		test2Id: int4('test2_id').references((): CockroachColumn => test2.id),
	});

	const test2 = cockroachTable('test2_table', {
		id: int4('id').primaryKey(),
		test1Id: int4('test1_id').references(() => test1.id),
	});
}
