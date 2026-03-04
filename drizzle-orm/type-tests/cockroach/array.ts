import { cockroachTable, int4 } from '~/cockroach-core/index.ts';

{
	const _table = cockroachTable('table', {
		a: int4('a').array().notNull(),
	});
}
