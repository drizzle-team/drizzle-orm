import { bigserial, pgSchema, text, uuid } from '~/pg-core/index.ts';
import { pgRole } from '~/pg-core/roles.ts';
import { sql } from '~/sql/sql.ts';

export const anonRole = pgRole('anon').existing();
export const authenticatedRole = pgRole('authenticated').existing();
export const serviceRole = pgRole('service_role').existing();
export const postgresRole = pgRole('postgres_role').existing();
export const supabaseAuthAdminRole = pgRole('supabase_auth_admin').existing();

/* ------------------------------ auth schema; ------------------------------ */
const auth = pgSchema('auth');

export const authUsers = auth.table('users', {
	id: uuid().primaryKey().notNull(),
});

/* ------------------------------ realtime schema; ------------------------------ */
const realtime = pgSchema('realtime');

export const realtimeMessages = realtime.table(
	'messages',
	{
		id: bigserial({ mode: 'bigint' }).primaryKey(),
		topic: text().notNull(),
		extension: text({
			enum: ['presence', 'broadcast', 'postgres_changes'],
		}).notNull(),
	},
);

export const authUid = sql`(select ${authUsers.id})`;
export const realtimeTopic = sql`${realtimeMessages.topic}`;
