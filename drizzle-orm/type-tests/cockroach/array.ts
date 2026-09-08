import { type Equal, Expect } from 'type-tests/utils.ts';
import { cockroachTable, int4, string } from '~/cockroach-core/index.ts';

{
	const _table = cockroachTable('table', {
		a: int4('a').array().notNull(),
	});
}

{
	const table = cockroachTable('t', {
		scalar: int4().default(1),
		arr: int4().array().default([1, 2]),
		matrix: int4().array('[][]').default([[1], [2, 3]]),
		branded: string().$type<'a' | 'b'>().array().default(['a']),
		fn: int4().array().$defaultFn(() => [1]),
	});

	Expect<Equal<number[] | null, typeof table.$inferSelect['arr']>>();
	Expect<Equal<number[][] | null, typeof table.$inferSelect['matrix']>>();
	Expect<Equal<('a' | 'b')[] | null, typeof table.$inferSelect['branded']>>();

	// @ts-expect-error - a scalar is not a valid default for an array column
	int4().array().default(1);
	// @ts-expect-error - a 1-D array is not a valid default for a 2-D column
	int4().array('[][]').default([1, 2]);
	// @ts-expect-error - the branded element type is enforced inside the array
	string().$type<'a' | 'b'>().array().default(['c']);
}
