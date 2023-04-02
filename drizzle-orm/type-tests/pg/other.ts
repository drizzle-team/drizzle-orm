import type { QueryResult } from 'pg';
import { eq, inArray } from '~/expressions';
import { sql } from '~/sql';

import type { Equal } from 'type-tests/utils';
import { Expect } from 'type-tests/utils';
import { db } from './db';
import { users } from './tables';

const rawQuery = await db.execute(
	sql`select ${users.id}, ${users.class} from ${users} where ${inArray(users.id, [1, 2, 3])} and ${
		eq(users.class, 'A')
	}`,
);

Expect<Equal<QueryResult<Record<string, unknown>>, typeof rawQuery>>;
