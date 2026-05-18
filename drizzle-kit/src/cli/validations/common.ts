import chalk from 'chalk';
import type { UnionToIntersection } from 'hono/utils/types';
import { dialect } from 'src/utils/schemaValidator';
import type { TypeOf } from 'zod';
import { any, boolean, coerce, enum as enum_, literal, object, string, union } from 'zod';
import { outputs } from './outputs';

export type Commands =
	| 'introspect'
	| 'generate'
	| 'check'
	| 'up'
	| 'drop'
	| 'push'
	| 'export';

// type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;
type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true;
type LastTupleElement<TArr extends any[]> = TArr extends [
	...start: infer _,
	end: infer Last,
] ? Last
	: never;

export type UniqueArrayOfUnion<TUnion, TArray extends TUnion[]> = Exclude<
	TUnion,
	TArray[number]
> extends never ? [TUnion]
	: [...TArray, Exclude<TUnion, TArray[number]>];

export const assertCollisions = <
	T extends Record<string, unknown>,
	TKeys extends (keyof T)[],
	TRemainingKeys extends Exclude<keyof T, TKeys[number] | 'config'>[],
	Exhaustive extends TRemainingKeys,
	UNIQ extends UniqueArrayOfUnion<TRemainingKeys[number], Exhaustive>,
>(
	command: Commands,
	options: T,
	whitelist: Exclude<TKeys, 'config'>,
	_remainingKeys: UniqueArrayOfUnion<TRemainingKeys[number], Exhaustive>,
): IsUnion<LastTupleElement<UNIQ>> extends false ? 'cli' | 'config' : TKeys => {
	const { config, ...rest } = options;

	let atLeastOneParam = false;
	for (const key of Object.keys(rest)) {
		if (whitelist.includes(key)) continue;

		atLeastOneParam = atLeastOneParam || rest[key] !== undefined;
	}

	if (!config && atLeastOneParam) {
		return 'cli' as any;
	}

	if (!atLeastOneParam) {
		return 'config' as any;
	}

	// if config and cli - return error - write a reason
	console.log(outputs.common.ambiguousParams(command));
	process.exit(1);
};

export const sqliteDriversLiterals = [
	literal('d1-http'),
	literal('expo'),
	literal('durable-sqlite'),
	literal('sqlite-cloud'),
] as const;

export const postgresqlDriversLiterals = [
	literal('aws-data-api'),
	literal('pglite'),
] as const;

export const casingTypes = ['snake_case', 'camelCase'] as const;
export const casingType = enum_(casingTypes);
export type CasingType = (typeof casingTypes)[number];

export const sqliteDriver = union(sqliteDriversLiterals);
export const postgresDriver = union(postgresqlDriversLiterals);
export const driver = union([sqliteDriver, postgresDriver]);

export const drivers = ['d1-http', 'expo', 'aws-data-api', 'pglite', 'durable-sqlite', 'sqlite-cloud'] as const;

export type Casing = TypeOf<typeof casing>;

export const configMigrations = object({
	table: string().default('__drizzle_migrations'),
	schema: string().default('drizzle'),
}).default({ table: '__drizzle_migrations', schema: 'drizzle' });

export const casing = union([literal('camel'), literal('preserve')]).default(
	'camel',
);

export type Driver = (typeof drivers)[number];

export const entitiesParams = {
	tablesFilter: union([string(), string().array()]).optional(),
	schemaFilter: union([string(), string().array()])
		.optional(),
	extensionsFilters: literal('postgis').array().optional(),
	entities: object({
		roles: boolean().or(object({
			provider: string().optional(),
			include: string().array().optional(),
			exclude: string().array().optional(),
		})).optional().default(false),
	}).optional(),
};
export type EntitiesFilter = TypeOf<typeof entitiesParams['entities']>;
export type TablesFilter = TypeOf<typeof entitiesParams['tablesFilter']>;
export type SchemasFilter = TypeOf<typeof entitiesParams['schemaFilter']>;
export type ExtensionsFilter = TypeOf<typeof entitiesParams['extensionsFilters']>;
export type EntitiesFilterConfig = {
	schemas: SchemasFilter;
	tables: TablesFilter;
	entities: EntitiesFilter;
	extensions: ExtensionsFilter;
};

export const configCommonSchema = object({
	dialect: dialect,
	out: string().default('drizzle'),
	breakpoints: boolean().optional().default(true),
	verbose: boolean().optional().default(false),
	driver: driver.optional(),
	dbCredentials: any().optional(),
});

export const configPull = configCommonSchema.extend({
	casing,
	migrations: configMigrations,
	...entitiesParams,
});

export const configCheck = configCommonSchema;

export const configGenerate = configCommonSchema.extend({
	schema: union([string(), string().array()]),
});

export const configPush = configCommonSchema.extend({
	schema: union([string(), string().array()]),
	explain: boolean().optional(),
	migrations: configMigrations,
	...entitiesParams,
});

export const configExport = configCommonSchema.extend({
	schema: union([string(), string().array()]),
});

export const studioCliParams = object({
	port: coerce.number().optional().default(4983),
	host: string().optional().default('127.0.0.1'),
	config: string().optional(),
});

export const configStudio = configCommonSchema.extend({
	schema: union([string(), string().array()]).optional(),
});

export const configMigrate = configCommonSchema.extend({
	migrations: configMigrations,
});

export const wrapParam = (
	name: string,
	param: any | undefined,
	optional: boolean = false,
	type?: 'url' | 'secret',
) => {
	const check = `[${chalk.green('✓')}]`;
	const cross = `[${chalk.red('x')}]`;
	if (typeof param === 'string') {
		if (param.length === 0) {
			return `    ${cross} ${name}: ''`;
		}
		if (type === 'secret') {
			return `    ${check} ${name}: '*****'`;
		} else if (type === 'url') {
			return `    ${check} ${name}: '${param.replace(/(?<=:\/\/[^:\n]*:)([^@]*)/, '****')}'`;
		}
		return `    ${check} ${name}: '${param}'`;
	}
	if (optional) {
		return chalk.gray(`        ${name}?: `);
	}
	return `    ${cross} ${name}: ${chalk.gray('undefined')}`;
};
