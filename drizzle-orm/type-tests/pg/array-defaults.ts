import { type Equal, Expect } from 'type-tests/utils.ts';
import { integer, pgTable, text } from '~/pg-core/index.ts';

const t = pgTable('t', {
	scalar: integer().default(1),
	arr: integer().array().default([1, 2]),
	matrix: integer().array('[][]').default([[1], [2, 3]]),
	branded: text().$type<'a' | 'b'>().array().default(['a']),
	fn: integer().array().$defaultFn(() => [1]),
});

Expect<Equal<number[] | null, typeof t.$inferSelect['arr']>>();
Expect<Equal<number[][] | null, typeof t.$inferSelect['matrix']>>();
Expect<Equal<('a' | 'b')[] | null, typeof t.$inferSelect['branded']>>();

// @ts-expect-error - a scalar is not a valid default for an array column
integer().array().default(1);
// @ts-expect-error - a 1-D array is not a valid default for a 2-D column
integer().array('[][]').default([1, 2]);
// @ts-expect-error - the branded element type is enforced inside the array
text().$type<'a' | 'b'>().array().default(['c']);
