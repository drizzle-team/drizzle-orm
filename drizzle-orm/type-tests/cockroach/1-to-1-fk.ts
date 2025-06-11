import { type CockroachDbColumn, int4 } from '~/cockroach-core/columns/index.ts';
import { cockroachdbTable } from '~/cockroach-core/table.ts';

{
	const test1 = cockroachdbTable('test1_table', {
		id: int4('id').primaryKey(),
		test2Id: int4('test2_id').references(() => test2.id),
	});

	const test1Id = int4('test1_id').references(() => test1.id);

	const test2 = cockroachdbTable('test2_table', {
		id: int4('id').primaryKey(),
		test1Id,
	});
}

{
	const test1 = cockroachdbTable('test1_table', {
		id: int4('id').primaryKey(),
		test2Id: int4('test2_id').references((): CockroachDbColumn => test2.id),
	});

	const test2 = cockroachdbTable('test2_table', {
		id: int4('id').primaryKey(),
		test1Id: int4('test1_id').references(() => test1.id),
	});
}
