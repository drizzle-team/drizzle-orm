import { integer, pgTable } from '~/pg-core/index.ts';

{
	const _table = pgTable('table', {
		a: integer('a').array().notNull(),
	});
}
