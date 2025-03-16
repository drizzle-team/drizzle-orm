import { enum as enumType, TypeOf, union } from 'zod';
import { mysqlSchema, mysqlSchemaSquashed } from './serializer/mysqlSchema';
import { pgSchema, pgSchemaSquashed } from './dialects/postgres/ddl';
import { singlestoreSchema, singlestoreSchemaSquashed } from './serializer/singlestoreSchema';
import { schemaSquashed as sqliteSchemaSquashed, sqliteSchema } from './dialects/sqlite/ddl';

export const dialects = ['postgresql', 'mysql', 'sqlite', 'turso', 'singlestore'] as const;
export const dialect = enumType(dialects);

export type Dialect = (typeof dialects)[number];
const _: Dialect = '' as TypeOf<typeof dialect>;

const commonSquashedSchema = union([
	pgSchemaSquashed,
	mysqlSchemaSquashed,
	sqliteSchemaSquashed,
	singlestoreSchemaSquashed,
]);

const commonSchema = union([pgSchema, mysqlSchema, sqliteSchema, singlestoreSchema]);

export type CommonSquashedSchema = TypeOf<typeof commonSquashedSchema>;
export type CommonSchema = TypeOf<typeof commonSchema>;
