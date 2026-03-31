import type { AdapterAccountType } from '@auth/core/adapters';
import { boolean, int, mysqlTable, primaryKey, timestamp, varchar } from '~/mysql-core/index.ts';

export const users = mysqlTable('user', {
	id: varchar('id', { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: varchar('name', { length: 255 }),
	email: varchar('email', { length: 255 }).unique(),
	emailVerified: timestamp('emailVerified', {
		mode: 'date',
		fsp: 3,
	}),
	image: varchar('image', { length: 255 }),
});

export const accounts = mysqlTable(
	'account',
	{
		userId: varchar('userId', { length: 255 })
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		type: varchar('type', { length: 255 })
			.$type<AdapterAccountType>()
			.notNull(),
		provider: varchar('provider', { length: 255 }).notNull(),
		providerAccountId: varchar('providerAccountId', { length: 255 }).notNull(),
		refresh_token: varchar('refresh_token', { length: 255 }),
		access_token: varchar('access_token', { length: 255 }),
		expires_at: int('expires_at'),
		token_type: varchar('token_type', { length: 255 }),
		scope: varchar('scope', { length: 255 }),
		id_token: varchar('id_token', { length: 2048 }),
		session_state: varchar('session_state', { length: 255 }),
	},
	(account) => [
		primaryKey({
			columns: [account.provider, account.providerAccountId],
		}),
	],
);

export const sessions = mysqlTable('session', {
	sessionToken: varchar('sessionToken', { length: 255 }).primaryKey(),
	userId: varchar('userId', { length: 255 })
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = mysqlTable(
	'verificationToken',
	{
		identifier: varchar('identifier', { length: 255 }).notNull(),
		token: varchar('token', { length: 255 }).notNull(),
		expires: timestamp('expires', { mode: 'date' }).notNull(),
	},
	(verificationToken) => [
		primaryKey({
			columns: [verificationToken.identifier, verificationToken.token],
		}),
	],
);

export const authenticators = mysqlTable(
	'authenticator',
	{
		credentialID: varchar('credentialID', { length: 255 }).notNull().unique(),
		userId: varchar('userId', { length: 255 })
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		providerAccountId: varchar('providerAccountId', { length: 255 }).notNull(),
		credentialPublicKey: varchar('credentialPublicKey', {
			length: 255,
		}).notNull(),
		counter: int('counter').notNull(),
		credentialDeviceType: varchar('credentialDeviceType', {
			length: 255,
		}).notNull(),
		credentialBackedUp: boolean('credentialBackedUp').notNull(),
		transports: varchar('transports', { length: 255 }),
	},
	(authenticator) => [
		primaryKey({
			columns: [authenticator.userId, authenticator.credentialID],
		}),
	],
);
