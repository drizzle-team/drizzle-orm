import { jsonb, pgSchema, text, timestamp } from '~/pg-core/index.ts';

const neonAuthSchema = pgSchema('neon_auth');

/**
 * Table schema of the `users_sync` table used by Neon Auth.
 * This table automatically synchronizes and stores user data from external authentication providers.
 *
 * @schema neon_auth
 * @table users_sync
 */
export const usersSync = neonAuthSchema.table('users_sync', {
	rawJson: jsonb('raw_json').notNull(),
	id: text().primaryKey().notNull(),
	name: text(),
	email: text(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }),
	deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
});
