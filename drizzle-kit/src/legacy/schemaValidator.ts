import type { TypeOf } from 'zod';
import { enum as enumType, union } from 'zod';
import { mysqlSchemaSquashed } from './mysql-v5/mysqlSchema';
import { pgSchemaSquashed } from './postgres-v7/pgSchema';
import { SQLiteSchemaSquashed } from './sqlite-v6/sqliteSchema';

export const dialects = ['postgresql', 'mysql', 'sqlite', 'turso', 'singlestore', 'gel'] as const;
export const dialect = enumType(dialects);

export type Dialect = (typeof dialects)[number];
const _: Dialect = '' as TypeOf<typeof dialect>;

const commonSquashedSchema = union([
	pgSchemaSquashed,
	mysqlSchemaSquashed,
	SQLiteSchemaSquashed,
]);

export type CommonSquashedSchema = TypeOf<typeof commonSquashedSchema>;
