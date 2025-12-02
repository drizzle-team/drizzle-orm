import type { TypeOf } from 'zod';
import { coerce, intersection, object, string, union } from 'zod';
import { dialect } from '../../utils/schemaValidator';
import { casingType } from './common';
import { mysqlCredentials } from './mysql';
import { postgresCredentials } from './postgres';
import { sqliteCredentials } from './sqlite';

export const credentials = intersection(
	postgresCredentials,
	mysqlCredentials,
	sqliteCredentials,
);

export type Credentials = TypeOf<typeof credentials>;

export const studioCliParams = object({
	port: coerce.number().optional().default(4983),
	host: string().optional().default('127.0.0.1'),
	config: string().optional(),
});

export const studioConfig = object({
	dialect,
	schema: union([string(), string().array()]).optional(),
	casing: casingType.optional(),
});
