import type { AnyColumn } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { schema } from '../../lib/schema.ts';

export type Schema = typeof schema;

export const db = drizzle({ connection: 'postgres:/...' });

type Check<TTables extends Record<string, unknown>> = {
	[K in keyof TTables as TTables[K] extends { _: { brand: 'Table'; name: string; columns: any } } ? K : never]:
		TTables[K] extends { _: { columns: infer Columns } } ? Columns : never;
};

type TextColumnsOnly<TColumns extends Record<string, unknown>> = {
	[
		K in keyof TColumns
	]: TColumns[K] extends AnyColumn<{
		data: infer Data;
	}> ? Data
		: never;
};

export type Tmp = TextColumnsOnly<Check<typeof schema>['apiWebhook']>;
