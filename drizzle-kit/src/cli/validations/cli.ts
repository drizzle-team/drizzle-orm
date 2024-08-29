import { boolean, intersection, literal, object, string, TypeOf, union } from 'zod';
import { dialect } from '../../schemaValidator';
import { casing } from './common';

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
	casing,
	breakpoints: boolean().optional().default(true),
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
