import { is } from 'drizzle-orm';
import {
	AnyPgTable,
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
import { safeRegister } from '../cli/commands/utils';
import { push_array } from '../utils';

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnyPgTable[] = [];
	const enums: PgEnum<any>[] = [];
	const schemas: PgSchema[] = [];
	const sequences: PgSequence[] = [];
	const roles: PgRole[] = [];
	const policies: PgPolicy[] = [];
	const views: PgView[] = [];
	const matViews: PgMaterializedView[] = [];

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

		if (isPgView(t)) {
			views.push(t);
		}

		if (isPgMaterializedView(t)) {
			matViews.push(t);
		}

		if (isPgSequence(t)) {
			sequences.push(t);
		}

		if (is(t, PgRole)) {
			roles.push(t);
		}

		if (is(t, PgPolicy)) {
			policies.push(t);
		}
	});

	return { tables, enums, schemas, sequences, views, matViews, roles, policies };
};

export const prepareFromPgImports = async (imports: string[]) => {
	const tables: AnyPgTable[] = [];
	const enums: PgEnum<any>[] = [];
	const schemas: PgSchema[] = [];
	const sequences: PgSequence[] = [];
	const views: PgView[] = [];
	const roles: PgRole[] = [];
	const policies: PgPolicy[] = [];
	const matViews: PgMaterializedView[] = [];

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];

		const i0: Record<string, unknown> = require(`${it}`);
		const prepared = prepareFromExports(i0);

		push_array(tables, prepared.tables);
		push_array(enums, prepared.enums);
		push_array(schemas, prepared.schemas);
		push_array(sequences, prepared.sequences);
		push_array(views, prepared.views);
		push_array(matViews, prepared.matViews);
		push_array(roles, prepared.roles);
		push_array(policies, prepared.policies);
	}
	unregister();

	return { tables: Array.from(new Set(tables)), enums, schemas, sequences, views, matViews, roles, policies };
};
