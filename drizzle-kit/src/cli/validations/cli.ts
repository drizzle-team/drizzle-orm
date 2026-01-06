import type { TypeOf } from 'zod';
import { boolean, intersection, literal, object, string, union } from 'zod';
import { dialect } from '../../utils/schemaValidator';
import { casing, casingType, configMigrations } from './common';

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

export const pushParams = object({
	dialect: dialect,
	casing: casingType.optional(),
	schema: union([string(), string().array()]),
	verbose: boolean().optional(),
	strict: boolean().optional(),
	explain: boolean().optional(),
	migrations: configMigrations,
	...entitiesParams,
}).passthrough();

export type PushParams = TypeOf<typeof pushParams>;

export const pullParams = object({
	config: string().optional(),
	dialect: dialect,
	out: string().optional().default('drizzle'),
	casing,
	breakpoints: boolean().optional().default(true),
	migrations: configMigrations,
	...entitiesParams,
}).passthrough();

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

export const configCheck = object({
	dialect: dialect.optional(),
	out: string().optional(),
});

export const cliConfigCheck = intersection(
	object({
		config: string().optional(),
	}),
	configCheck,
);

export type CliCheckConfig = TypeOf<typeof cliConfigCheck>;
