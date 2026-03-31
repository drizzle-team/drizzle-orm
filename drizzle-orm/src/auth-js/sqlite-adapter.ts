import type {
	Adapter,
	AdapterAccount,
	AdapterAuthenticator,
	AdapterSession,
	AdapterUser,
	VerificationToken,
} from '@auth/core/adapters';
import type { Awaitable } from '@auth/core/types';
import type { ColumnBaseConfig } from '~/column.ts';
import { and, eq } from '~/sql/index.ts';
import type { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import type { SQLiteColumn } from '~/sqlite-core/index.ts';
import type { SQLiteTableWithColumns } from '~/sqlite-core/table.ts';
import { getColumns } from '~/utils.ts';
import * as defaultSchema from './sqlite-schema.ts';

function defineTables(
	schema: Partial<DefaultSqliteSchema> = {},
): Required<DefaultSqliteSchema> {
	const usersTable = schema.usersTable ?? defaultSchema.users;
	const accountsTable = schema.accountsTable ?? defaultSchema.accounts;
	const sessionsTable = schema.sessionsTable ?? defaultSchema.sessions;
	const verificationTokensTable = schema.verificationTokensTable ?? defaultSchema.verificationTokens;
	const authenticatorsTable = schema.authenticatorsTable ?? defaultSchema.authenticators;

	return {
		usersTable,
		accountsTable,
		sessionsTable,
		verificationTokensTable,
		authenticatorsTable,
	};
}

export function defineAdapter(
	client: BaseSQLiteDatabase<'sync' | 'async', any, any>,
	schema?: Partial<DefaultSqliteSchema>,
): Adapter {
	const {
		usersTable,
		accountsTable,
		sessionsTable,
		verificationTokensTable,
		authenticatorsTable,
	} = defineTables(schema);

	return {
		async createUser(data: AdapterUser) {
			const { id, ...insertData } = data;
			const hasDefaultId = getColumns(usersTable)['id']['hasDefault'];

			return client
				.insert(usersTable)
				.values(hasDefaultId ? insertData : { ...insertData, id })
				.returning()
				.get() as Awaitable<AdapterUser>;
		},
		async getUser(userId: string) {
			const result = (await client
				.select()
				.from(usersTable)
				.where(eq(usersTable.id, userId))
				.get()) ?? null;

			return result as Awaitable<AdapterUser | null>;
		},
		async getUserByEmail(email: string) {
			const result = (await client
				.select()
				.from(usersTable)
				.where(eq(usersTable.email, email))
				.get()) ?? null;

			return result as Awaitable<AdapterUser | null>;
		},
		async createSession(data: {
			sessionToken: string;
			userId: string;
			expires: Date;
		}) {
			return client.insert(sessionsTable).values(data).returning().get();
		},
		async getSessionAndUser(sessionToken: string) {
			const result = (await client
				.select({
					session: sessionsTable,
					user: usersTable,
				})
				.from(sessionsTable)
				.where(eq(sessionsTable.sessionToken, sessionToken))
				.innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
				.get()) ?? null;

			return result as Awaitable<
				{
					session: AdapterSession;
					user: AdapterUser;
				} | null
			>;
		},
		async updateUser(data: Partial<AdapterUser> & Pick<AdapterUser, 'id'>) {
			if (!data.id) {
				throw new Error('No user id.');
			}

			const result = await client
				.update(usersTable)
				.set(data)
				.where(eq(usersTable.id, data.id))
				.returning()
				.get();

			if (!result) {
				throw new Error('User not found.');
			}

			return result as Awaitable<AdapterUser>;
		},
		async updateSession(
			data: Partial<AdapterSession> & Pick<AdapterSession, 'sessionToken'>,
		) {
			const result = await client
				.update(sessionsTable)
				.set(data)
				.where(eq(sessionsTable.sessionToken, data.sessionToken))
				.returning()
				.get();

			return result ?? null;
		},
		async linkAccount(data: AdapterAccount) {
			await client.insert(accountsTable).values(data).run();
		},
		async getUserByAccount(
			account: Pick<AdapterAccount, 'provider' | 'providerAccountId'>,
		) {
			const result = await client
				.select({
					account: accountsTable,
					user: usersTable,
				})
				.from(accountsTable)
				.innerJoin(usersTable, eq(accountsTable.userId, usersTable.id))
				.where(
					and(
						eq(accountsTable.provider, account.provider),
						eq(accountsTable.providerAccountId, account.providerAccountId),
					),
				)
				.get();

			const user = result?.user ?? null;

			return user as Awaitable<AdapterUser | null>;
		},
		async deleteSession(sessionToken: string) {
			await client
				.delete(sessionsTable)
				.where(eq(sessionsTable.sessionToken, sessionToken))
				.run();
		},
		async createVerificationToken(data: VerificationToken) {
			return client
				.insert(verificationTokensTable)
				.values(data)
				.returning()
				.get();
		},
		async useVerificationToken(params: { identifier: string; token: string }) {
			const result = await client
				.delete(verificationTokensTable)
				.where(
					and(
						eq(verificationTokensTable.identifier, params.identifier),
						eq(verificationTokensTable.token, params.token),
					),
				)
				.returning()
				.get();

			return result ?? null;
		},
		async deleteUser(id: string) {
			await client.delete(usersTable).where(eq(usersTable.id, id)).run();
		},
		async unlinkAccount(
			params: Pick<AdapterAccount, 'provider' | 'providerAccountId'>,
		) {
			await client
				.delete(accountsTable)
				.where(
					and(
						eq(accountsTable.provider, params.provider),
						eq(accountsTable.providerAccountId, params.providerAccountId),
					),
				)
				.run();
		},
		async getAccount(providerAccountId: string, provider: string) {
			return client
				.select()
				.from(accountsTable)
				.where(
					and(
						eq(accountsTable.provider, provider),
						eq(accountsTable.providerAccountId, providerAccountId),
					),
				)
				.then((res) => res[0] ?? null) as Promise<AdapterAccount | null>;
		},
		async createAuthenticator(data: AdapterAuthenticator) {
			return client
				.insert(authenticatorsTable)
				.values(data)
				.returning()
				.then((res) => res[0] ?? null) as Awaitable<AdapterAuthenticator>;
		},
		async getAuthenticator(credentialID: string) {
			return client
				.select()
				.from(authenticatorsTable)
				.where(eq(authenticatorsTable.credentialID, credentialID))
				.then((res) => res[0] ?? null) as Awaitable<AdapterAuthenticator | null>;
		},
		async listAuthenticatorsByUserId(userId: string) {
			return client
				.select()
				.from(authenticatorsTable)
				.where(eq(authenticatorsTable.userId, userId))
				.then((res) => res) as Awaitable<AdapterAuthenticator[]>;
		},
		async updateAuthenticatorCounter(credentialID: string, newCounter: number) {
			const authenticator = await client
				.update(authenticatorsTable)
				.set({ counter: newCounter })
				.where(eq(authenticatorsTable.credentialID, credentialID))
				.returning()
				.then((res) => res[0]);

			if (!authenticator) throw new Error('Authenticator not found.');

			return authenticator as Awaitable<AdapterAuthenticator>;
		},
	};
}

type DefaultMyqlColumn<
	T extends {
		data: string | number | boolean | Date;
		dataType: 'string' | 'number' | 'number int53' | 'boolean' | 'object date';
		notNull: boolean;
		hasDefault?: boolean;
		isPrimaryKey?: boolean;
	},
> = SQLiteColumn<
	ColumnBaseConfig<T['dataType']> & {
		data: T['data'];
		dataType: T['dataType'];
		notNull: T['notNull'];
		hasDefault: T['hasDefault'] extends true ? true : false;
	}
>;

type DefaultSqliteUsersTable = SQLiteTableWithColumns<{
	name: string;
	columns: {
		id: DefaultMyqlColumn<{
			isPrimaryKey: true;
			data: string;
			dataType: 'string';
			notNull: true;
			hasDefault: true;
		}>;
		name: DefaultMyqlColumn<{
			data: string;
			dataType: 'string';
			notNull: boolean;
		}>;
		email: DefaultMyqlColumn<{
			data: string;
			dataType: 'string';
			notNull: boolean;
		}>;
		emailVerified: DefaultMyqlColumn<{
			data: Date;
			dataType: 'object date';
			notNull: boolean;
		}>;
		image: DefaultMyqlColumn<{
			data: string;
			dataType: 'string';
			notNull: boolean;
		}>;
	};
	dialect: 'sqlite';
	schema: string | undefined;
}>;

type DefaultSqliteAccountsTable = SQLiteTableWithColumns<{
	name: string;
	columns: {
		userId: DefaultMyqlColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		type: DefaultMyqlColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		provider: DefaultMyqlColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		providerAccountId: DefaultMyqlColumn<{
			dataType: 'string';
			data: string;
			notNull: true;
		}>;
		refresh_token: DefaultMyqlColumn<{
			dataType: 'string';
			data: string;
			notNull: boolean;
		}>;
		access_token: DefaultMyqlColumn<{
			dataType: 'string';
			data: string;
			driverParam: string | number;
			notNull: boolean;
		}>;
		expires_at: DefaultMyqlColumn<{
			dataType: 'number int53';
			data: number;
			notNull: boolean;
		}>;
		token_type: DefaultMyqlColumn<{
			dataType: 'string';
			data: string;
			notNull: boolean;
		}>;
		scope: DefaultMyqlColumn<{
			dataType: 'string';
			data: string;
			notNull: boolean;
		}>;
		id_token: DefaultMyqlColumn<{
			dataType: 'string';
			data: string;
			notNull: boolean;
		}>;
		session_state: DefaultMyqlColumn<{
			dataType: 'string';
			data: string;
			notNull: boolean;
		}>;
	};
	dialect: 'sqlite';
	schema: string | undefined;
}>;

type DefaultSqliteSessionsTable = SQLiteTableWithColumns<{
	name: string;
	columns: {
		sessionToken: DefaultMyqlColumn<{
			isPrimaryKey: true;
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		userId: DefaultMyqlColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		expires: DefaultMyqlColumn<{
			dataType: 'object date';
			data: Date;
			notNull: true;
		}>;
	};
	dialect: 'sqlite';
	schema: string | undefined;
}>;

type DefaultSqliteVerificationTokenTable = SQLiteTableWithColumns<{
	name: string;
	columns: {
		identifier: DefaultMyqlColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		token: DefaultMyqlColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		expires: DefaultMyqlColumn<{
			dataType: 'object date';
			data: Date;
			notNull: true;
		}>;
	};
	dialect: 'sqlite';
	schema: string | undefined;
}>;

type DefaultSqliteAuthenticatorTable = SQLiteTableWithColumns<{
	name: string;
	columns: {
		credentialID: DefaultMyqlColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		userId: DefaultMyqlColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		providerAccountId: DefaultMyqlColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		credentialPublicKey: DefaultMyqlColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		counter: DefaultMyqlColumn<{
			data: number;
			notNull: true;
			dataType: 'number int53';
		}>;
		credentialDeviceType: DefaultMyqlColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		credentialBackedUp: DefaultMyqlColumn<{
			data: boolean;
			notNull: true;
			dataType: 'boolean';
		}>;
		transports: DefaultMyqlColumn<{
			data: string;
			notNull: false;
			dataType: 'string';
		}>;
	};
	dialect: 'sqlite';
	schema: string | undefined;
}>;

export type DefaultSqliteSchema = {
	usersTable: DefaultSqliteUsersTable;
	accountsTable: DefaultSqliteAccountsTable;
	sessionsTable?: DefaultSqliteSessionsTable;
	verificationTokensTable?: DefaultSqliteVerificationTokenTable;
	authenticatorsTable?: DefaultSqliteAuthenticatorTable;
};
