import { gelTable, integer } from '~/gel-core/index.ts';

{
	const _table = gelTable('table', {
		a: integer('a').array().notNull(),
	});
}
