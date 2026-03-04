import { is } from 'orm044';
import type { PgEnum, PgEnumObject, PgMaterializedView, PgSequence, PgView } from 'orm044/pg-core';
import {
	isPgEnum,
	isPgMaterializedView,
	isPgSequence,
	isPgView,
	PgPolicy,
	PgRole,
	PgSchema,
	PgTable,
} from 'orm044/pg-core';
import type { CasingType } from '../common';
import type { PgSchema as SCHEMA } from './pgSchema';
import { generatePgSnapshot } from './pgSerializer';

export type PostgresSchema = Record<
	string,
	| PgTable<any>
	| PgEnum<any>
	| PgEnumObject<any>
	| PgSchema
	| PgSequence
	| PgView
	| PgMaterializedView
	| PgRole
	| PgPolicy
	| unknown
>;

export const serializePg = async (
	schema: PostgresSchema,
	casing: CasingType | undefined,
	schemaFilter?: string[],
): Promise<SCHEMA> => {
	const tables = Object.values(schema).filter((it) => is(it, PgTable)) as PgTable[];
	const schemas = Object.values(schema).filter((it) => is(it, PgSchema)) as PgSchema[];
	const enums = Object.values(schema).filter((it) => isPgEnum(it)) as PgEnum<any>[];
	const sequences = Object.values(schema).filter((it) => isPgSequence(it)) as PgSequence[];
	const roles = Object.values(schema).filter((it) => is(it, PgRole)) as PgRole[];
	const policies = Object.values(schema).filter((it) => is(it, PgPolicy)) as PgPolicy[];
	const views = Object.values(schema).filter((it) => isPgView(it)) as PgView[];
	const materializedViews = Object.values(schema).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

	return {
		id: 'id',
		prevId: 'prev_id',
		...generatePgSnapshot(
			tables,
			enums,
			schemas,
			sequences,
			roles,
			policies,
			views,
			materializedViews,
			casing,
			schemaFilter,
		),
	};
};
