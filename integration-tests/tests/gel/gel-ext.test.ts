import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm/_relations';
import { drizzle, type GelJsDatabase } from 'drizzle-orm/gel';
import { foreignKey, gelSchema, gelTable, text, timestamptz, uniqueIndex, uuid } from 'drizzle-orm/gel-core';
import createClient, { type Client } from 'gel';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import 'zx/globals';

export const extauth = gelSchema('ext::auth');

export const identityInExtauth = extauth.table('Identity', {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	createdAt: timestamptz('created_at').default(sql`(clock_timestamp())`).notNull(),
	issuer: text().notNull(),
	modifiedAt: timestamptz('modified_at').notNull(),
	subject: text().notNull(),
}, (table) => [
	uniqueIndex('6bc2dd19-bce4-5810-bb1b-7007afe97a11;schemaconstr').using(
		'btree',
		table.id.asc().nullsLast().op('uuid_ops'),
	),
]);

export const user = gelTable('User', {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	email: text().notNull(),
	identityId: uuid('identity_id').notNull(),
	username: text().notNull(),
}, (table) => [
	uniqueIndex('d504514c-26a7-11f0-b836-81aa188c0abe;schemaconstr').using(
		'btree',
		table.id.asc().nullsLast().op('uuid_ops'),
	),
	foreignKey({
		columns: [table.identityId],
		foreignColumns: [identityInExtauth.id],
		name: 'User_fk_identity',
	}),
]);

export const userRelations = relations(user, ({ one }) => ({
	identity: one(identityInExtauth, { references: [identityInExtauth.id], fields: [user.identityId] }),
}));

const schema = { user, identityInExtauth, userRelations };

let client: Client;
let db: GelJsDatabase<typeof schema>;
const tlsSecurity: string = 'insecure';
let dsn: string;

beforeAll(async () => {
	const connectionString = process.env['GEL_CONNECTION_STRING'];
	if (!connectionString) throw new Error('gel GEL_CONNECTION_STRING is not set. ');

	client = createClient({ dsn: connectionString, tlsSecurity: 'insecure' });
	db = drizzle({ client, schema: { user, identityInExtauth, userRelations } });

	dsn = connectionString;
});

afterAll(async () => {
	await client?.close().catch(console.error);
});

describe('extensions tests group', async () => {
	beforeAll(async () => {
		await $`gel query 'reset schema to initial ;
  CREATE EXTENSION pgcrypto VERSION "1.3";
  CREATE EXTENSION auth VERSION "1.0";
  CREATE TYPE default::User {
      CREATE REQUIRED LINK identity: ext::auth::Identity;
      CREATE REQUIRED PROPERTY email: std::str;
      CREATE REQUIRED PROPERTY username: std::str;
  };
  CREATE GLOBAL default::current_user := (std::assert_single((SELECT
      default::User {
          id,
          username,
          email
      }
  FILTER
      (.identity = GLOBAL ext::auth::ClientTokenIdentity)
  )));' --tls-security=${tlsSecurity} --dsn=${dsn}`;
	});

	afterEach(async () => {
		await client.querySQL(`DELETE FROM "User";`);
	});

	test('check that you can query from ext::auth schema in gel', async () => {
		const [response] = await db.insert(identityInExtauth).values({
			issuer: 'issuer',
			subject: 'subject',
			modifiedAt: new Date(),
		}).returning();
		await db.insert(user).values({ identityId: response!.id, username: 'username', email: 'email' });

		const userResponse = await db.select().from(user);
		const authResponse = await db.select().from(identityInExtauth);
		const relationsResponse = await db._query.user.findMany({
			columns: {
				id: false,
				identityId: false,
			},
			with: {
				identity: {
					columns: {
						id: false,
						modifiedAt: false,
						createdAt: false,
					},
				},
			},
		});

		expect(relationsResponse).toStrictEqual([{
			email: 'email',
			identity: { issuer: 'issuer', subject: 'subject' },
			username: 'username',
		}]);
		expect(userResponse.length).toBe(1);
		expect(authResponse.length).toBe(1);

		expect(userResponse[0]!.username).toBe('username');
		expect(userResponse[0]!.email).toBe('email');

		expect(authResponse[0]!.issuer).toBe('issuer');
		expect(authResponse[0]!.subject).toBe('subject');
	});
});
