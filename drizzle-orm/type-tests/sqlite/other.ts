import type { RunResult } from 'better-sqlite3';
import { eq, inArray } from '~/expressions';
import { sql } from '~/sql';

import type { Equal } from 'type-tests/utils';
import { Expect } from 'type-tests/utils';
import { db } from './db';
import { users } from './tables';

const query = sql`select ${users.id}, ${users.class} from ${users} where ${inArray(users.id, [1, 2, 3])} and ${
	eq(users.class, 'A')
}`;

const all = db.all(query);
Expect<Equal<unknown[], typeof all>>;

const allValuesTyped = db.values<[number, 'A' | 'B' | 'C']>(query);
Expect<Equal<[number, 'A' | 'B' | 'C'][], typeof allValuesTyped>>;

const allObjects = db.all(query);
Expect<Equal<unknown[], typeof allObjects>>;

const allObjectsTyped = db.all<{ id: number; class: 'A' | 'B' | 'C' }>(query);
Expect<Equal<{ id: number; class: 'A' | 'B' | 'C' }[], typeof allObjectsTyped>>;

const run = db.run(query);
Expect<Equal<RunResult, typeof run>>;
