import { Schema as s } from 'effect';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';

import { createSelectSchema } from '~/effect-schema/index.ts';
import { pgTable } from '~/pg-core/index.ts';

type MyBrandedId = string & { readonly __brand: 'MyBrandedId' };

const table = pgTable('test', ({ uuid }) => ({
	id: uuid().$type<MyBrandedId>().notNull(),
}));

const schema = createSelectSchema(table);

Expect<Equal<s.Schema.Type<typeof schema>['id'], MyBrandedId>>();

const fooLiteral = s.Literal('Foo');
type Foo = s.Schema.Type<typeof fooLiteral>;

const literalTable = pgTable('literal_test', ({ varchar }) => ({
	value: varchar().$type<Foo>().notNull(),
}));

const literalSchema = createSelectSchema(literalTable);

Expect<Equal<s.Schema.Type<typeof literalSchema>['value'], Foo>>();
