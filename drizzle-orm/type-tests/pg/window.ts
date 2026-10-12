import { Expect } from 'type-tests/utils.ts';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import { firstValue, lag, lead } from '~/sql/functions/index.ts';
import { sql } from '~/sql/sql.ts';
import type { Equal } from '~/utils.ts';

const values = pgTable('values', { id: integer('id'), value: text('value') });
const lagValue = lag(values.value).over();
const leadValue = lead(values.value).over();
const first = firstValue(values.value).over();
const lagWithDefault = lag(values.value, 1, sql<string>`'fallback'`).over();
const leadWithDefault = lead(values.value, undefined, sql<string>`'fallback'`).over();

Expect<Equal<typeof lagValue, import('~/sql/sql.ts').SQL<string | null>>>;
Expect<Equal<typeof leadValue, import('~/sql/sql.ts').SQL<string | null>>>;
Expect<Equal<typeof first, import('~/sql/sql.ts').SQL<string | null>>>;
Expect<Equal<typeof lagWithDefault, import('~/sql/sql.ts').SQL<string>>>;
Expect<Equal<typeof leadWithDefault, import('~/sql/sql.ts').SQL<string>>>;
