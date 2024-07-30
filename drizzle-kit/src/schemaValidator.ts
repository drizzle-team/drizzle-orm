import { enum as enumType, TypeOf, union } from 'zod';
import { mysqlSchema, mysqlSchemaSquashed } from './serializer/mysqlSchema';
import { pgSchema, pgSchemaSquashed } from './serializer/pgSchema';
import { sqliteSchema, SQLiteSchemaSquashed } from './serializer/sqliteSchema';

export const dialects = ['postgresql', 'mysql', 'sqlite'] as const;
export const dialect = enumType(dialects);

export type Dialect = (typeof dialects)[number];
const _: Dialect = '' as TypeOf<typeof dialect>;

const commonSquashedSchema = union([
	pgSchemaSquashed,
	mysqlSchemaSquashed,
	SQLiteSchemaSquashed,
]);

const commonSchema = union([pgSchema, mysqlSchema, sqliteSchema]);

export type CommonSquashedSchema = TypeOf<typeof commonSquashedSchema>;
export type CommonSchema = TypeOf<typeof commonSchema>;
