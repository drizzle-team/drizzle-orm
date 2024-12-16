import { bigserial, pgSchema, text, timestamp, uuid, varchar } from '~/pg-core/index.ts';
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
	email: varchar({ length: 255 }),
	phone: text().unique(),
	emailConfirmedAt: timestamp('email_confirmed_at', { withTimezone: true }),
	phoneConfirmedAt: timestamp('phone_confirmed_at', { withTimezone: true }),
	lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }),
	updatedAt: timestamp('updated_at', { withTimezone: true }),
});

/* ------------------------------ realtime schema; ------------------------------- */
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

export const authUid = sql`(select auth.uid())`;
export const realtimeTopic = sql`realtime.topic()`;
