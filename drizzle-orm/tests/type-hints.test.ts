import { RDSDataClient } from '@aws-sdk/client-rds-data';
import crypto from 'crypto';
import { expect, test } from 'vitest';

import { drizzle } from '~/aws-data-api/pg';
import { customType, json, PgDialect, pgTable, text, timestamp, uuid, varchar } from '~/pg-core';
import { sql } from '~/sql/sql';

const db = drizzle({
	client: new RDSDataClient(),
	database: '',
	resourceArn: '',
	secretArn: '',
});

test('type hints - case #1', () => {
	const t = pgTable('t', {
		id: varchar('id', { length: 255 }).primaryKey(),
		workspaceID: varchar('workspace_id', { length: 255 }).notNull(),
		description: text('description').notNull(),
		enrichment: json('enrichment').notNull(),
		category: text('category'),
		tags: text('tags').array().notNull(),
		counterpartyName: text('counterparty_name'),
		timePlaced: timestamp('time_placed').notNull(),
		timeSynced: timestamp('time_synced').notNull(),
	});

	const q = db.insert(t).values({
		id: 'id',
		tags: [],
		workspaceID: 'workspaceID',
		enrichment: {},
		category: 'category',
		description: 'description',
		timePlaced: new Date(),
		timeSynced: sql<string>`CURRENT_TIMESTAMP(6)`,
		counterpartyName: 'counterpartyName',
	});

	const query = new PgDialect().sqlToQuery(q.getSQL());

	expect(query.typings).toEqual(['none', 'none', 'none', 'json', 'none', 'none', 'none', 'timestamp']);
});

test('type hints - case #2', () => {
	const prefixedUlid = <Prefix extends string, PrefixedUlid = `${Prefix}_${string}`>(
		name: string,
		opts: { prefix: Prefix },
	) =>
		customType<{ data: PrefixedUlid; driverData: string }>({
			dataType: () => 'uuid',
			toDriver: (value) => {
				return value as string;
			},
			fromDriver: (value) => {
				return `${opts.prefix}_${value}` as PrefixedUlid;
			},
		})(name);

	const calendars = pgTable('calendars', {
		id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
		orgMembershipId: prefixedUlid('om_id', { prefix: 'om' }).notNull(),
		platform: text('platform').notNull(),
		externalId: text('external_id').notNull(),
		externalData: json('external_data').notNull(),
		updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
		createdAt: timestamp('created_at').notNull().default(sql`now()`),
	});

	const q = db
		.insert(calendars)
		.values({
			id: crypto.randomUUID(),
			orgMembershipId: 'om_id',
			platform: 'platform',
			externalId: 'externalId',
			externalData: {},
		})
		.returning();

	const query = new PgDialect().sqlToQuery(q.getSQL());

	expect(query.typings).toEqual(['uuid', 'none', 'none', 'none', 'json']);
});
