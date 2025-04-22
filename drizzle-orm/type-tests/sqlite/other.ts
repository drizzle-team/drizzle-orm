import type { RunResult } from 'better-sqlite3';
import { eq, inArray } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';

import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

const query = sql`select ${users.id}, ${users.class} from ${users} where ${inArray(users.id, [1, 2, 3])} and ${
	eq(users.class, 'A')
}`;

const all = await db.all(query);
Expect<Equal<unknown[], typeof all>>;

const allValuesTyped = await db.values<[number, 'A' | 'B' | 'C']>(query);
Expect<Equal<[number, 'A' | 'B' | 'C'][], typeof allValuesTyped>>;

const allObjects = await db.all(query);
Expect<Equal<unknown[], typeof allObjects>>;

const allObjectsTyped = await db.all<{ id: number; class: 'A' | 'B' | 'C' }>(query);
Expect<Equal<{ id: number; class: 'A' | 'B' | 'C' }[], typeof allObjectsTyped>>;

const run = await db.run(query);
Expect<Equal<RunResult, typeof run>>;
