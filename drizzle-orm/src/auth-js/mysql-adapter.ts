import type {
	Adapter,
	AdapterAccount,
	AdapterAuthenticator,
	AdapterSession,
	AdapterUser,
	VerificationToken,
} from '@auth/core/adapters';
import type { Awaitable } from '@auth/core/types';
import type { ColumnBaseConfig } from '~/column';
import type {
	MySqlColumn,
	MySqlDatabase,
	MySqlQueryResultHKT,
	MySqlTableWithColumns,
	PreparedQueryHKTBase,
} from '~/mysql-core/index.ts';
import { and, eq } from '~/sql/index.ts';
import { getColumns } from '~/utils.ts';
import * as defaultSchema from './mysql-schema.ts';

function defineTables(
	schema: Partial<DefaultMySqlSchema> = {},
): Required<DefaultMySqlSchema> {
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
	client: MySqlDatabase<MySqlQueryResultHKT, PreparedQueryHKTBase, any>,
	schema?: Partial<DefaultMySqlSchema>,
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
			const hasDefaultId = getColumns(usersTable)['id']['defaultFn'];

			const [insertedUser] = (await client
				.insert(usersTable)
				.values(hasDefaultId ? insertData : { ...insertData, id })
				.$returningId()) as [{ id: string }] | [];

			return client
				.select()
				.from(usersTable)
				.where(eq(usersTable.id, insertedUser ? insertedUser.id : id))
				.then((res) => res[0]) as Awaitable<AdapterUser>;
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
			await client.insert(sessionsTable).values(data);

			return client
				.select()
				.from(sessionsTable)
				.where(eq(sessionsTable.sessionToken, data.sessionToken))
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

			await client
				.update(usersTable)
				.set(data)
				.where(eq(usersTable.id, data.id));

			const [result] = await client
				.select()
				.from(usersTable)
				.where(eq(usersTable.id, data.id));

			if (!result) {
				throw new Error('No user found.');
			}

			return result as Awaitable<AdapterUser>;
		},
		async updateSession(
			data: Partial<AdapterSession> & Pick<AdapterSession, 'sessionToken'>,
		) {
			await client
				.update(sessionsTable)
				.set(data)
				.where(eq(sessionsTable.sessionToken, data.sessionToken));

			return client
				.select()
				.from(sessionsTable)
				.where(eq(sessionsTable.sessionToken, data.sessionToken))
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
			await client.insert(verificationTokensTable).values(data);

			return client
				.select()
				.from(verificationTokensTable)
				.where(eq(verificationTokensTable.identifier, data.identifier))
				.then((res) => res[0]);
		},
		async useVerificationToken(params: { identifier: string; token: string }) {
			const deletedToken = await client
				.select()
				.from(verificationTokensTable)
				.where(
					and(
						eq(verificationTokensTable.identifier, params.identifier),
						eq(verificationTokensTable.token, params.token),
					),
				)
				.then((res) => (res.length > 0 ? res[0] : null));

			if (deletedToken) {
				await client
					.delete(verificationTokensTable)
					.where(
						and(
							eq(verificationTokensTable.identifier, params.identifier),
							eq(verificationTokensTable.token, params.token),
						),
					);
			}

			return deletedToken as VerificationToken | null;
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
			await client.insert(authenticatorsTable).values(data);

			return (await client
				.select()
				.from(authenticatorsTable)
				.where(eq(authenticatorsTable.credentialID, data.credentialID))
				.then((res) => res[0] ?? null)) as Awaitable<AdapterAuthenticator>;
		},
		async getAuthenticator(credentialID: string) {
			return (await client
				.select()
				.from(authenticatorsTable)
				.where(eq(authenticatorsTable.credentialID, credentialID))
				.then(
					(res) => res[0] ?? null,
				)) as Awaitable<AdapterAuthenticator | null>;
		},
		async listAuthenticatorsByUserId(userId: string) {
			return (await client
				.select()
				.from(authenticatorsTable)
				.where(eq(authenticatorsTable.userId, userId))
				.then((res) => res)) as Awaitable<AdapterAuthenticator[]>;
		},
		async updateAuthenticatorCounter(credentialID: string, newCounter: number) {
			await client
				.update(authenticatorsTable)
				.set({ counter: newCounter })
				.where(eq(authenticatorsTable.credentialID, credentialID));

			const authenticator = await client
				.select()
				.from(authenticatorsTable)
				.where(eq(authenticatorsTable.credentialID, credentialID))
				.then((res) => res[0]);

			if (!authenticator) throw new Error('Authenticator not found.');

			return authenticator as Awaitable<AdapterAuthenticator>;
		},
	};
}

type DefaultMyqlColumn<
	T extends {
		data: string | number | boolean | Date;
		dataType: 'string' | 'number' | 'number int32' | 'boolean' | 'object date';
		notNull: boolean;
		hasDefault?: boolean;
		isPrimaryKey?: boolean;
	},
> = MySqlColumn<
	ColumnBaseConfig<T['dataType']> & {
		data: T['data'];
		dataType: T['dataType'];
		notNull: T['notNull'];
		hasDefault: T['hasDefault'] extends true ? true : false;
	}
>;

type DefaultMySqlUsersTable = MySqlTableWithColumns<{
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
	dialect: 'mysql';
	schema: string | undefined;
}>;

type DefaultMySqlAccountsTable = MySqlTableWithColumns<{
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
			dataType: 'number int32';
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
	dialect: 'mysql';
	schema: string | undefined;
}>;

type DefaultMySqlSessionsTable = MySqlTableWithColumns<{
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
	dialect: 'mysql';
	schema: string | undefined;
}>;

type DefaultMySqlVerificationTokenTable = MySqlTableWithColumns<{
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
	dialect: 'mysql';
	schema: string | undefined;
}>;

type DefaultMySqlAuthenticatorTable = MySqlTableWithColumns<{
	name: string;
	columns: {
		credentialID: DefaultMyqlColumn<{
			columnType: 'MySqlVarChar' | 'MySqlText';
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		userId: DefaultMyqlColumn<{
			columnType: 'MySqlVarChar' | 'MySqlText';
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		providerAccountId: DefaultMyqlColumn<{
			columnType: 'MySqlVarChar' | 'MySqlText';
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		credentialPublicKey: DefaultMyqlColumn<{
			columnType: 'MySqlVarChar' | 'MySqlText';
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		counter: DefaultMyqlColumn<{
			columnType: 'MySqlInt';
			data: number;
			notNull: true;
			dataType: 'number int32';
		}>;
		credentialDeviceType: DefaultMyqlColumn<{
			columnType: 'MySqlVarChar' | 'MySqlText';
			data: string;
			notNull: true;
			dataType: 'string';
		}>;
		credentialBackedUp: DefaultMyqlColumn<{
			columnType: 'MySqlBoolean';
			data: boolean;
			notNull: true;
			dataType: 'boolean';
		}>;
		transports: DefaultMyqlColumn<{
			columnType: 'MySqlVarChar' | 'MySqlText';
			data: string;
			notNull: false;
			dataType: 'string';
		}>;
	};
	dialect: 'mysql';
	schema: string | undefined;
}>;

export type DefaultMySqlSchema = {
	usersTable: DefaultMySqlUsersTable;
	accountsTable: DefaultMySqlAccountsTable;
	sessionsTable?: DefaultMySqlSessionsTable;
	verificationTokensTable?: DefaultMySqlVerificationTokenTable;
	authenticatorsTable?: DefaultMySqlAuthenticatorTable;
};
