import { sql } from 'drizzle-orm';
import { cockroachPolicy, cockroachRole } from 'drizzle-orm/cockroach-core';
import { pgPolicy, pgRole } from 'drizzle-orm/pg-core';

pgPolicy('policy', {
	as: undefined,
	for: undefined,
	to: undefined,
	using: undefined,
	withCheck: undefined,
});
pgRole('role', { createDb: undefined, createRole: undefined, inherit: undefined });

cockroachPolicy('policy', {
	as: undefined,
	for: undefined,
	to: undefined,
	using: undefined,
	withCheck: undefined,
});
cockroachRole('role', { createDb: undefined, createRole: undefined });

pgPolicy('policy', { as: 'restrictive', for: 'select', using: sql`true` });
cockroachPolicy('policy', { as: 'permissive', for: 'all', withCheck: sql`true` });
pgRole('role', { createDb: true, createRole: false, inherit: true });
cockroachRole('role', { createDb: false, createRole: true });

// @ts-expect-error invalid policy mode
pgPolicy('policy', { as: 'invalid' });
// @ts-expect-error role flags must be boolean
cockroachRole('role', { createDb: 'true' });
