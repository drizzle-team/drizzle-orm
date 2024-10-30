import type { PgDatabase } from '~/pg-core/db.ts';
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

export type SupabaseToken = {
	iss?: string;
	sub?: string;
	aud?: string[] | string;
	exp?: number;
	nbf?: number;
	iat?: number;
	jti?: string;
	role?: string;
};

export function createDrizzle(
	token: SupabaseToken,
	{ admin, client }: { admin: PgDatabase<any>; client: PgDatabase<any> },
) {
	return {
		admin,
		rls: (async (transaction, ...rest) => {
			return await client.transaction(async (tx) => {
				// Supabase exposes auth.uid() and auth.jwt()
				// https://supabase.com/docs/guides/database/postgres/row-level-security#helper-functions
				try {
					await tx.execute(sql`
						-- auth.jwt()
						select set_config('request.jwt.claims', '${
						sql.raw(
							JSON.stringify(token),
						)
					}', TRUE);
						-- auth.uid()
						select set_config('request.jwt.claim.sub', '${
						sql.raw(
							token.sub ?? '',
						)
					}', TRUE);												
						-- set local role
						set local role ${sql.raw(token.role ?? 'anon')};
					`);
					return await transaction(tx);
				} finally {
					await tx.execute(sql`
						-- reset
						select set_config('request.jwt.claims', NULL, TRUE);
						select set_config('request.jwt.claim.sub', NULL, TRUE);
						reset role;
					`);
				}
			}, ...rest);
		}) as typeof client.transaction,
	};
}
