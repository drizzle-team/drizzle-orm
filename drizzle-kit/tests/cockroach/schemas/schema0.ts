import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	check,
	cockroachEnum,
	cockroachSchema,
	cockroachSequence,
	index,
	jsonb,
	smallint,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/cockroach-core';

// generated with AI and updated manually in some places

export const core = cockroachSchema('core');
export const currencyCode = cockroachEnum('currency_code', ['USD', 'EUR', 'GBP', 'UAH', 'JPY']);

export const seqOrgCode = cockroachSequence('seq_org_code', {
	startWith: '1000',
	increment: '1',
	minValue: '1',
	maxValue: '9223372036854775807',
	cache: '1',
});

export const organizationsInCore = core.table('organizations', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: bigint({ mode: 'number' }).default(sql`nextval('public.seq_org_code'::REGCLASS)`).notNull(),
	name: text().notNull(),
	domain: text(),
	currency: currencyCode().default('EUR').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index('core_org_name_idx').using('btree', table.name.asc()),
	index('organizations_code_idx').using('btree', table.code.asc()),
	unique('organizations_domain_key').on(table.domain),
	check('organizations_name_check', sql`char_length(name) > 1`),
]);

export const taskQueueInAnalytics = core.table('task_queue', {
	id: uuid().defaultRandom().primaryKey().notNull(),
	queueName: text('queue_name').default('default').notNull(),
	payload: jsonb().notNull(),
	priority: smallint().default(100).notNull(),
	reserved: boolean().default(false).notNull(),
	reservedUntil: timestamp('reserved_until', { withTimezone: true, mode: 'string' }),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (t) => [
	uniqueIndex('analytics_task_queue_unique_unreserved').using(
		'btree',
		sql`queue_name`,
		sql`((${t.payload} ->> 'task_type'::text))`,
	).where(sql`(reserved = false)`),
]);
