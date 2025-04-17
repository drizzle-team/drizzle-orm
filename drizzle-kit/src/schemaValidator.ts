import { enum as enumType, TypeOf, union } from 'zod';
import { mssqlSchema, mssqlSchemaSquashed } from './serializer/mssqlSchema';
import { mysqlSchema, mysqlSchemaSquashed } from './serializer/mysqlSchema';
import { pgSchema, pgSchemaSquashed } from './serializer/pgSchema';
import { singlestoreSchema, singlestoreSchemaSquashed } from './serializer/singlestoreSchema';
import { sqliteSchema, SQLiteSchemaSquashed } from './serializer/sqliteSchema';

export const dialects = ['postgresql', 'mysql', 'sqlite', 'turso', 'singlestore', 'gel', 'mssql'] as const;
export const dialect = enumType(dialects);

export type Dialect = (typeof dialects)[number];
const _: Dialect = '' as TypeOf<typeof dialect>;

const commonSquashedSchema = union([
	pgSchemaSquashed,
	mysqlSchemaSquashed,
	SQLiteSchemaSquashed,
	singlestoreSchemaSquashed,
	mssqlSchemaSquashed,
]);

const commonSchema = union([pgSchema, mysqlSchema, sqliteSchema, singlestoreSchema, mssqlSchema]);

export type CommonSquashedSchema = TypeOf<typeof commonSquashedSchema>;
export type CommonSchema = TypeOf<typeof commonSchema>;
