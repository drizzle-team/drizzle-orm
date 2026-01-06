import type { TypeOf } from 'zod';
import { enum as enumType } from 'zod';

export const dialects = [
	'postgresql',
	'mysql',
	'sqlite',
	'turso',
	'singlestore',
	'gel',
	'mssql',
	'cockroach',
	'duckdb',
] as const;
export const dialect = enumType(dialects);

export type Dialect = (typeof dialects)[number];
const _: Dialect = '' as TypeOf<typeof dialect>;
