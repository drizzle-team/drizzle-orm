import { drizzle } from 'drizzle-orm/node-postgres';
import type { schema } from '../../lib/schema.ts';

export type Schema = typeof schema;

export const db = drizzle({ connection: 'postgres:/...' });

type Check<TTables extends Record<string, unknown>> = {
	[K in keyof TTables as TTables[K] extends { _: { brand: 'Table'; name: string; columns: any } } ? K : never]:
		TTables[K] extends { _: { columns: infer Columns } } ? Columns : never;
};

export type Tmp = Check<typeof schema>;

export const tmp = {} as Tmp;

export const idData = tmp.apiWebhook.id._.dataType;
export const configData = tmp.apiWebhook.cfg._.dataType;
export const createdData = tmp.apiWebhook.createdBy._.dataType;
export const timeData = tmp.apiWebhook.createdAt._.dataType;
