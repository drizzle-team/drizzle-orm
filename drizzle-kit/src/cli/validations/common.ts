import chalk from 'chalk';
import { UnionToIntersection } from 'hono/utils/types';
import { any, boolean, enum as enum_, literal, object, string, TypeOf, union } from 'zod';
import { dialect } from '../../schemaValidator';
import { outputs } from './outputs';

export type Commands =
	| 'introspect'
	| 'generate'
	| 'check'
	| 'up'
	| 'drop'
	| 'push'
	| 'export';

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;
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
	remainingKeys: UniqueArrayOfUnion<TRemainingKeys[number], Exhaustive>,
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
] as const;

export const postgresqlDriversLiterals = [
	literal('aws-data-api'),
	literal('pglite'),
] as const;

export const prefixes = [
	'index',
	'timestamp',
	'supabase',
	'unix',
	'none',
] as const;
export const prefix = enum_(prefixes);
export type Prefix = (typeof prefixes)[number];

{
	const _: Prefix = '' as TypeOf<typeof prefix>;
}

export const casingTypes = ['snake_case', 'camelCase'] as const;
export const casingType = enum_(casingTypes);
export type CasingType = (typeof casingTypes)[number];

export const sqliteDriver = union(sqliteDriversLiterals);
export const postgresDriver = union(postgresqlDriversLiterals);
export const driver = union([sqliteDriver, postgresDriver]);

export const configMigrations = object({
	table: string().optional(),
	schema: string().optional(),
	prefix: prefix.optional().default('index'),
}).optional();

export const configCommonSchema = object({
	dialect: dialect,
	schema: union([string(), string().array()]).optional(),
	out: string().optional(),
	breakpoints: boolean().optional().default(true),
	verbose: boolean().optional().default(false),
	driver: driver.optional(),
	tablesFilter: union([string(), string().array()]).optional(),
	schemaFilter: union([string(), string().array()]).default(['public']),
	migrations: configMigrations,
	dbCredentials: any().optional(),
	casing: casingType.optional(),
	sql: boolean().default(true),
}).passthrough();

export const casing = union([literal('camel'), literal('preserve')]).default(
	'camel',
);

export const introspectParams = object({
	schema: union([string(), string().array()]).optional(),
	out: string().optional().default('./drizzle'),
	breakpoints: boolean().default(true),
	tablesFilter: union([string(), string().array()]).optional(),
	schemaFilter: union([string(), string().array()]).default(['public']),
	introspect: object({
		casing,
	}).default({ casing: 'camel' }),
});

export type IntrospectParams = TypeOf<typeof introspectParams>;
export type Casing = TypeOf<typeof casing>;

export const configIntrospectCliSchema = object({
	schema: union([string(), string().array()]).optional(),
	out: string().optional().default('./drizzle'),
	breakpoints: boolean().default(true),
	tablesFilter: union([string(), string().array()]).optional(),
	schemaFilter: union([string(), string().array()]).default(['public']),
	introspectCasing: union([literal('camel'), literal('preserve')]).default(
		'camel',
	),
});

export const configGenerateSchema = object({
	schema: union([string(), string().array()]),
	out: string().optional().default('./drizzle'),
	breakpoints: boolean().default(true),
});

export type GenerateSchema = TypeOf<typeof configGenerateSchema>;

export const configPushSchema = object({
	dialect: dialect,
	schema: union([string(), string().array()]),
	tablesFilter: union([string(), string().array()]).optional(),
	schemaFilter: union([string(), string().array()]).default(['public']),
	verbose: boolean().default(false),
	strict: boolean().default(false),
	out: string().optional(),
});

export type CliConfig = TypeOf<typeof configCommonSchema>;
export const drivers = ['d1-http', 'expo', 'aws-data-api', 'pglite', 'durable-sqlite'] as const;
export type Driver = (typeof drivers)[number];
const _: Driver = '' as TypeOf<typeof driver>;

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
