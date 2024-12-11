import type { QueryResult } from 'pg';
import { eq, inArray } from '~/expressions.ts';
import { sql } from '~/sql/sql.ts';

import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { integer } from '~/pg-core/index.ts';
import { pgTable } from '~/pg-core/table.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

{
	const rawQuery = await db.execute(
		sql`select ${users.id}, ${users.class} from ${users} where ${inArray(users.id, [1, 2, 3])} and ${
			eq(users.class, 'A')
		}`,
	);

	Expect<Equal<QueryResult<Record<string, unknown>>, typeof rawQuery>>;
}

{
	const table = pgTable('table', {
		col: integer(),
	});
	const q = sql``.mapWith(table.col);

	Expect<Equal<typeof q['_']['type'], typeof table['$inferSelect']['col']>>;
}
