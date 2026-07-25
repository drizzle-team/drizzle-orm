import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';

import { isNotNull } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';

import { db } from './db.ts';
import { users } from './tables.ts';

const results = await db
	.select({
		id: users.id,
		hasTitleOrm: isNotNull(users.name),
		hasTitleSql: sql<boolean>`${users.name} IS NOT NULL`,
	})
	.from(users);

type Result = (typeof results)[number];

Expect<Equal<Result['hasTitleOrm'], boolean>>();
Expect<Equal<Result['hasTitleSql'], boolean>>();
