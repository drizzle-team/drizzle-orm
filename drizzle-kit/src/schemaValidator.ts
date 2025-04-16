import { enum as enumType, TypeOf, union } from 'zod';
import { mysqlSchema, mysqlSchemaSquashed } from './serializer/mysqlSchema';
import { pgSchema, pgSchemaSquashed } from './dialects/postgres/snapshot';
import { singlestoreSchema } from './serializer/singlestoreSchema';

export const dialects = ['postgresql', 'mysql', 'sqlite', 'turso', 'singlestore'] as const;
export const dialect = enumType(dialects);

export type Dialect = (typeof dialects)[number];
const _: Dialect = '' as TypeOf<typeof dialect>;

const commonSquashedSchema = union([
	pgSchemaSquashed,
	mysqlSchemaSquashed,
	mysqlSchemaSquashed,
]);

const commonSchema = union([pgSchema, mysqlSchema, singlestoreSchema]);

export type CommonSquashedSchema = TypeOf<typeof commonSquashedSchema>;
export type CommonSchema = TypeOf<typeof commonSchema>;
