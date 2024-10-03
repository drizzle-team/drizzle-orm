import { is } from 'drizzle-orm';
import { AnyPgTable, isPgEnum, isPgSequence, PgEnum, PgMaterializedView, PgSchema, PgSequence, PgTable, PgView } from 'drizzle-orm/pg-core';
import { safeRegister } from '../cli/commands/utils';
import { printValidationErrors, validatePgSchema } from 'src/validate-schema/validate';
import { CasingType } from 'src/cli/validations/common';

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnyPgTable[] = [];
	const enums: PgEnum<any>[] = [];
	const schemas: PgSchema[] = [];
	const sequences: PgSequence[] = [];
	const views: PgView[] = [];
	const materializedViews: PgMaterializedView[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (isPgEnum(t)) {
			enums.push(t);
			return;
		}
		if (is(t, PgTable)) {
			tables.push(t);
		}

		if (is(t, PgSchema)) {
			schemas.push(t);
		}

		if (isPgSequence(t)) {
			sequences.push(t);
		}

		if (is(t, PgView)) {
			views.push(t);
		}

		if (is(t, PgMaterializedView)) {
			materializedViews.push(t);
		}
	});

	return { tables, enums, schemas, sequences, views, materializedViews };
};

export const prepareFromPgImports = async (imports: string[], casing: CasingType | undefined,) => {
	let tables: AnyPgTable[] = [];
	let enums: PgEnum<any>[] = [];
	let schemas: PgSchema[] = [];
	let sequences: PgSequence[] = [];
	let views: PgView[] = [];
	let materializedViews: PgMaterializedView[] = [];

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];

		const i0: Record<string, unknown> = require(`${it}`);
		const prepared = prepareFromExports(i0);

		tables.push(...prepared.tables);
		enums.push(...prepared.enums);
		schemas.push(...prepared.schemas);
		sequences.push(...prepared.sequences);
		views.push(...prepared.views);
		materializedViews.push(...prepared.materializedViews);
	}
	unregister();

	const errors = validatePgSchema(casing, schemas, tables, views, materializedViews, enums, sequences);
	if (errors.messages.length > 0) {
		printValidationErrors(errors.messages);
		process.exit(1);
	}

	return { tables: Array.from(new Set(tables)), enums, schemas, sequences };
};
