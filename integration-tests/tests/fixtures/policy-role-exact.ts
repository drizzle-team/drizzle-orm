import { cockroachPolicy, cockroachRole } from 'drizzle-orm/cockroach-core';
import type { CockroachPolicyConfig, CockroachRoleConfig } from 'drizzle-orm/cockroach-core';
import { pgPolicy, pgRole } from 'drizzle-orm/pg-core';
import type { PgPolicyConfig, PgRoleConfig } from 'drizzle-orm/pg-core';

const postgresPolicy: PgPolicyConfig = pgPolicy('read_access', { for: 'select' });
const postgresRole: PgRoleConfig = pgRole('reader', { createDb: false });
const cockroachPolicyConfig: CockroachPolicyConfig = cockroachPolicy('read_access', { for: 'select' });
const cockroachRoleConfig: CockroachRoleConfig = cockroachRole('reader', { createDb: false });

export { cockroachPolicyConfig, cockroachRoleConfig, postgresPolicy, postgresRole };
