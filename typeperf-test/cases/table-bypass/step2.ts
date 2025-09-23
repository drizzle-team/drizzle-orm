import type { RelationsBuilderEntry, Table } from 'drizzle-orm';
import type * as schema from '../../lib/big-schema.ts';

// export type ExtractTablesFromSchema<TSchema extends Record<string, unknown>> = {
// 	[K in keyof TSchema & string as TSchema[K] extends Table ? K : never]: TSchema[K] extends Table ? TSchema[K]
// 		: never;
// };

type TrimSchema<U extends Record<string, unknown>> = {
	[
		K in keyof U as U[K] extends { '~brand': 'Table' } ? K : never
	]: U[K] & Table;
};

export type RelationsBuilderConfig<TTables extends Record<string, Table>> = {
	[TTableName in keyof TTables & string]: Record<
		string,
		RelationsBuilderEntry<TTables, TTableName>
	>;
};

export type Step1 = TrimSchema<typeof schema>;
export type Step2 = RelationsBuilderConfig<Step1>;

// export type Config = RelationsBuilderConfig<ExtractTablesFromSchema<typeof schema>>;
// export type Config = RelationsBuilderConfig<TrimSchema<typeof schema>>;
