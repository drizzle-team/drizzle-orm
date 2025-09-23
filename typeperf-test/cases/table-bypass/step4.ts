import {
	defineRelations,
	type ExtractTablesWithRelations,
	type RelationsFilter,
	sql,
	type Table,
	type View,
} from 'drizzle-orm';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';

export const apiWebhook = pgTable('ApiWebhook', {
	failures: text(),
});

export const user = pgTable('user', {
	id: text(),
});

const schema = {
	apiWebhook,
	user,
};

const relations = defineRelations(schema);

export type ExtractTablesFromSchema<TSchema extends Record<string, unknown>> = {
	[
		K in keyof TSchema as TSchema[K] extends { '~brand': 'Table' | 'View'; _: any } ? K : never
	]: TSchema[K] & (Table | View);
};

type Extracted = ExtractTablesFromSchema<typeof schema>;

export type A = Extracted['apiWebhook']['_']['columns'];

const db = drizzle({
	relations,
});

db.query.apiWebhook.findMany({
	where: {
		failures: sql.placeholder(''),
	},
});

type TRCfg = ExtractTablesWithRelations<typeof relations>;

export type F = RelationsFilter<TRCfg['apiWebhook'], TRCfg>;
