import { is } from 'drizzle-orm';
import {
	isPgEnum,
	isPgMaterializedView,
	isPgSequence,
	isPgView,
	PgEnum,
	PgMaterializedView,
	PgPolicy,
	PgRole,
	PgSchema,
	PgSequence,
	PgTable,
	PgView,
} from 'drizzle-orm/pg-core';
import { resolver } from 'src/cli/prompts';
import { CasingType } from 'src/cli/validations/common';
import {
	Column,
	Enum,
	interimToDDL,
	Policy,
	PostgresEntities,
	Role,
	Schema,
	Sequence,
	View,
} from 'src/dialects/postgres/ddl';
import { ddlDif } from 'src/dialects/postgres/diff';
import { fromDrizzleSchema } from 'src/dialects/postgres/drizzle';
import { mockResolver } from 'src/utils/mocks';

export type PostgresSchema = Record<
	string,
	| PgTable<any>
	| PgEnum<any>
	| PgSchema
	| PgSequence
	| PgView
	| PgMaterializedView
	| PgRole
	| PgPolicy
>;

export const diffTestSchemas = async (
	left: PostgresSchema,
	right: PostgresSchema,
	renamesArr: string[],
	cli: boolean = false,
	casing?: CasingType | undefined,
) => {
	const leftTables = Object.values(left).filter((it) => is(it, PgTable)) as PgTable[];
	const rightTables = Object.values(right).filter((it) => is(it, PgTable)) as PgTable[];

	const leftSchemas = Object.values(left).filter((it) => is(it, PgSchema)) as PgSchema[];
	const rightSchemas = Object.values(right).filter((it) => is(it, PgSchema)) as PgSchema[];

	const leftEnums = Object.values(left).filter((it) => isPgEnum(it)) as PgEnum<any>[];
	const rightEnums = Object.values(right).filter((it) => isPgEnum(it)) as PgEnum<any>[];

	const leftSequences = Object.values(left).filter((it) => isPgSequence(it)) as PgSequence[];
	const rightSequences = Object.values(right).filter((it) => isPgSequence(it)) as PgSequence[];

	const leftRoles = Object.values(left).filter((it) => is(it, PgRole)) as PgRole[];
	const rightRoles = Object.values(right).filter((it) => is(it, PgRole)) as PgRole[];

	const leftPolicies = Object.values(left).filter((it) => is(it, PgPolicy)) as PgPolicy[];
	const rightPolicies = Object.values(right).filter((it) => is(it, PgPolicy)) as PgPolicy[];

	const leftViews = Object.values(left).filter((it) => isPgView(it)) as PgView[];
	const rightViews = Object.values(right).filter((it) => isPgView(it)) as PgView[];

	const leftMaterializedViews = Object.values(left).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];
	const rightMaterializedViews = Object.values(right).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

	const { schema: schemaLeft } = fromDrizzleSchema(
		leftSchemas,
		leftTables,
		leftEnums,
		leftSequences,
		leftRoles,
		leftPolicies,
		leftViews,
		leftMaterializedViews,
		casing,
	);

	const { schema: schemaRight, errors, warnings } = fromDrizzleSchema(
		rightSchemas,
		rightTables,
		rightEnums,
		rightSequences,
		rightRoles,
		rightPolicies,
		rightViews,
		rightMaterializedViews,
		casing,
	);

	if (errors.length) {
		throw new Error();
	}
	const { ddl: ddl1, errors: err1 } = interimToDDL(schemaLeft);
	const { ddl: ddl2, errors: err2 } = interimToDDL(schemaRight);

	if (err1.length > 0 || err2.length > 0) {
		return { sqlStatements: [], statements: [], groupedStatements: [], err1, err2 };
	}

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements, groupedStatements } = await ddlDif(
			ddl1,
			ddl2,
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames),
			mockResolver(renames), // uniques
			mockResolver(renames), // indexes
			mockResolver(renames), // checks
			mockResolver(renames), // pks
			mockResolver(renames), // fks
			'default',
		);
		return { sqlStatements, statements, groupedStatements };
	} else {
		const { sqlStatements, statements, groupedStatements } = await ddlDif(
			ddl1,
			ddl2,
			resolver<Schema>('schema'),
			resolver<Enum>('enum'),
			resolver<Sequence>('sequence'),
			resolver<Policy>('policy'),
			resolver<Role>('role'),
			resolver<PostgresEntities['tables']>('table'),
			resolver<Column>('column'),
			resolver<View>('view'),
			mockResolver(renames), // uniques
			mockResolver(renames), // indexes
			mockResolver(renames), // checks
			mockResolver(renames), // pks
			mockResolver(renames), // fks
			'default',
		);
		return { sqlStatements, statements, groupedStatements };
	}
};
