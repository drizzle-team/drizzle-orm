import type {
	Adapter,
	AdapterAccount,
	AdapterAuthenticator,
	AdapterSession,
	AdapterUser,
	VerificationToken,
} from '@auth/core/adapters';
import type { Awaitable } from '@auth/core/types';
import type {
	PgAsyncDatabase,
	PgBuildColumn,
	PgColumnBuilderConfig,
	PgQueryResultHKT,
	PgTableWithColumns,
} from '~/pg-core/index.ts';
import { and, eq } from '~/sql/index.ts';
import { getColumns } from '~/utils.ts';
import * as defaultSchema from './pg-schema.ts';

function defineTables(
	schema: Partial<DefaultPostgresSchema> = {},
): Required<DefaultPostgresSchema> {
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
	client: PgAsyncDatabase<PgQueryResultHKT, any>,
	schema?: Partial<DefaultPostgresSchema>,
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
				.then((res) => res[0]) as Awaitable<AdapterUser & typeof usersTable.$inferSelect>;
		},
		async getUser(userId: string) {
			return client
				.select()
				.from(usersTable)
				.where(eq(usersTable.id, userId))
				.then((res) => res.length > 0 ? res[0] : null) as Awaitable<AdapterUser | null>;
		},
		async getUserByEmail(email: string) {
			return client
				.select()
				.from(usersTable)
				.where(eq(usersTable.email, email))
				.then((res) => res.length > 0 ? res[0] : null) as Awaitable<AdapterUser | null>;
		},
		async createSession(data: {
			sessionToken: string;
			userId: string;
			expires: Date;
		}) {
			return client
				.insert(sessionsTable)
				.values(data)
				.returning()
				.then((res) => res[0]) as Awaitable<AdapterSession>;
		},
		async getSessionAndUser(sessionToken: string) {
			return client
				.select({
					session: sessionsTable,
					user: usersTable,
				})
				.from(sessionsTable)
				.where(eq(sessionsTable.sessionToken, sessionToken))
				.innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
				.then((res) => (res.length > 0 ? res[0] : null)) as Awaitable<
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

			const [result] = await client
				.update(usersTable)
				.set(data)
				.where(eq(usersTable.id, data.id))
				.returning();

			if (!result) {
				throw new Error('No user found.');
			}

			return result as Awaitable<AdapterUser>;
		},
		async updateSession(
			data: Partial<AdapterSession> & Pick<AdapterSession, 'sessionToken'>,
		) {
			return client
				.update(sessionsTable)
				.set(data)
				.where(eq(sessionsTable.sessionToken, data.sessionToken))
				.returning()
				.then((res) => res[0]);
		},
		async linkAccount(data: AdapterAccount) {
			await client.insert(accountsTable).values(data);
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
				.then((res) => res[0]);

			const user = result?.user ?? null;
			return user as Awaitable<AdapterUser | null>;
		},
		async deleteSession(sessionToken: string) {
			await client
				.delete(sessionsTable)
				.where(eq(sessionsTable.sessionToken, sessionToken));
		},
		async createVerificationToken(data: VerificationToken) {
			return client
				.insert(verificationTokensTable)
				.values(data)
				.returning()
				.then((res) => res[0]);
		},
		async useVerificationToken(params: { identifier: string; token: string }) {
			return client
				.delete(verificationTokensTable)
				.where(
					and(
						eq(verificationTokensTable.identifier, params.identifier),
						eq(verificationTokensTable.token, params.token),
					),
				)
				.returning()
				.then((res) => (res.length > 0 ? res[0] : null)) as Awaitable<VerificationToken | null>;
		},
		async deleteUser(id: string) {
			await client.delete(usersTable).where(eq(usersTable.id, id));
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
				);
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

type DefaultPostgresColumn<
	T extends {
		data: string | number | boolean | Date;
		dataType: 'string' | 'number' | 'number int32' | 'boolean' | 'object date';
		notNull: boolean;
		hasDefault?: boolean;
		isPrimaryKey?: boolean;
	},
> = PgBuildColumn<string, {
	['_']: PgColumnBuilderConfig & {
		data: T['data'];
		dataType: T['dataType'];
		notNull: T['notNull'];
		hasDefault: T['hasDefault'] extends true ? true : false;
	};
}>;

type DefaultPostgresUsersTable = PgTableWithColumns<{
	name: string;
	columns: {
		id: DefaultPostgresColumn<{
			dataType: 'string';
			isPrimaryKey: true;
			data: string;
			notNull: true;
			hasDefault: true;
		}>;
		name: DefaultPostgresColumn<{
			data: string;
			notNull: boolean;
			dataType: 'string';
		}>;
		email: DefaultPostgresColumn<{
			data: string;
			notNull: boolean;
			dataType: 'string';
		}>;
		emailVerified: DefaultPostgresColumn<{
			dataType: 'object date';
			data: Date;
			notNull: boolean;
		}>;
		image: DefaultPostgresColumn<{
			dataType: 'string';
			data: string;
			notNull: boolean;
		}>;
	};
	dialect: 'pg';
	schema: string | undefined;
}>;

type DefaultPostgresAccountsTable = PgTableWithColumns<{
	name: string;
	columns: {
		userId: DefaultPostgresColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		type: DefaultPostgresColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		provider: DefaultPostgresColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		providerAccountId: DefaultPostgresColumn<{
			dataType: 'string';
			data: string;
			notNull: true;
		}>;
		refresh_token: DefaultPostgresColumn<{
			dataType: 'string';
			data: string;
			notNull: boolean;
		}>;
		access_token: DefaultPostgresColumn<{
			dataType: 'string';
			data: string;
			notNull: boolean;
		}>;
		expires_at: DefaultPostgresColumn<{
			dataType: 'number int32';
			data: number;
			notNull: boolean;
		}>;
		token_type: DefaultPostgresColumn<{
			dataType: 'string';
			data: string;
			notNull: boolean;
		}>;
		scope: DefaultPostgresColumn<{
			dataType: 'string';
			data: string;
			notNull: boolean;
		}>;
		id_token: DefaultPostgresColumn<{
			dataType: 'string';
			data: string;
			notNull: boolean;
		}>;
		session_state: DefaultPostgresColumn<{
			dataType: 'string';
			data: string;
			notNull: boolean;
		}>;
	};
	dialect: 'pg';
	schema: string | undefined;
}>;

type DefaultPostgresSessionsTable = PgTableWithColumns<{
	name: string;
	columns: {
		sessionToken: DefaultPostgresColumn<{
			data: string;
			isPrimaryKey: true;
			notNull: true;
			dataType: 'string';
		}>;
		userId: DefaultPostgresColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		expires: DefaultPostgresColumn<{
			dataType: 'object date';
			data: Date;
			notNull: true;
		}>;
	};
	dialect: 'pg';
	schema: string | undefined;
}>;

type DefaultPostgresVerificationTokenTable = PgTableWithColumns<{
	name: string;
	columns: {
		identifier: DefaultPostgresColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		token: DefaultPostgresColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		expires: DefaultPostgresColumn<{
			dataType: 'object date';
			data: Date;
			notNull: true;
		}>;
	};
	dialect: 'pg';
	schema: string | undefined;
}>;

type DefaultPostgresAuthenticatorTable = PgTableWithColumns<{
	name: string;
	columns: {
		credentialID: DefaultPostgresColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		userId: DefaultPostgresColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		providerAccountId: DefaultPostgresColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		credentialPublicKey: DefaultPostgresColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		counter: DefaultPostgresColumn<{
			data: number;
			notNull: true;
			dataType: 'number int32';
		}>;
		credentialDeviceType: DefaultPostgresColumn<{
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		credentialBackedUp: DefaultPostgresColumn<{
			data: boolean;
			notNull: true;
			dataType: 'boolean';
		}>;
		transports: DefaultPostgresColumn<{
			data: string;
			notNull: false;
			dataType: 'string';
		}>;
	};
	dialect: 'pg';
	schema: string | undefined;
}>;

export type DefaultPostgresSchema = {
	usersTable: DefaultPostgresUsersTable;
	accountsTable: DefaultPostgresAccountsTable;
	sessionsTable?: DefaultPostgresSessionsTable;
	verificationTokensTable?: DefaultPostgresVerificationTokenTable;
	authenticatorsTable?: DefaultPostgresAuthenticatorTable;
};
