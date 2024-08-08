import { boolean, intersection, literal, object, string, TypeOf, union } from 'zod';
import { dialect } from '../../schemaValidator';
import { casing, prefix } from './common';

export const cliConfigGenerate = object({
	dialect: dialect.optional(),
	schema: union([string(), string().array()]).optional(),
	out: string().optional().default('./drizzle'),
	config: string().optional(),
	name: string().optional(),
	prefix: prefix.optional(),
	breakpoints: boolean().optional().default(true),
	custom: boolean().optional().default(false),
}).strict();

export type CliConfigGenerate = TypeOf<typeof cliConfigGenerate>;

export const pushParams = object({
	dialect: dialect,
	schema: union([string(), string().array()]),
	tablesFilter: union([string(), string().array()]).optional(),
	schemaFilter: union([string(), string().array()])
		.optional()
		.default(['public']),
	extensionsFilters: literal('postgis').array().optional(),
	verbose: boolean().optional(),
	strict: boolean().optional(),
}).passthrough();

export type PushParams = TypeOf<typeof pushParams>;

export const pullParams = object({
	config: string().optional(),
	dialect: dialect,
	out: string().optional().default('drizzle'),
	tablesFilter: union([string(), string().array()]).optional(),
	schemaFilter: union([string(), string().array()])
		.optional()
		.default(['public']),
	extensionsFilters: literal('postgis').array().optional(),
	introspectCasing: casing,
	breakpoints: boolean().optional().default(true),
	database: object({
		prefix: prefix.optional().default('index'),
	}).optional(),
}).passthrough();

export type PullParams = TypeOf<typeof pullParams>;

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
