import { Minimatch } from 'minimatch';
import type { EntitiesFilter, ExtensionsFilter, SchemasFilter, TablesFilter } from 'src/cli/validations/cli';
import { assertUnreachable } from 'src/utils';
import type { Dialect } from 'src/utils/schemaValidator';

export type Schema = { type: 'schema'; name: string };
export type Table = { type: 'table'; schema: string | false; name: string };
export type Role = { type: 'role'; name: string };

/*
	there's a double edge sword with having narrow list here
	on one hand we can filter other entities through these 3 types

	on the other hand when debugged - you see schema/table filter invocation
	for all other types like enums, sequences, etc.

	I will leave this as is and in introspect I will rely on introspected schemas and tables
	to filter list of dependent entities, that'd probably be the go to
*/
export type KitEntity = Schema | Table | Role;

export type EntityFilter = (it: KitEntity) => boolean;

export const prepareEntityFilter = (
	dialect: Dialect,
	params: {
		tables: TablesFilter;
		schemas: SchemasFilter;
		entities: EntitiesFilter;
		extensions: ExtensionsFilter;
	},
	/* .existing() in drizzle schema */
	existingEntities: (Schema | Table)[],
): EntityFilter => {
	const tablesConfig = typeof params.tables === 'undefined'
		? []
		: typeof params.tables === 'string'
		? [params.tables]
		: params.tables;

	const schemasConfig = typeof params.schemas === 'undefined'
		? []
		: typeof params.schemas === 'string'
		? [params.schemas]
		: params.schemas;

	const existingSchemas = existingEntities.filter((x) => x.type === 'schema').map((x) => x.name);

	const schemasFilter = prepareSchemasFitler(schemasConfig, existingSchemas);

	const postgisTablesGlobs = ['!geography_columns', '!geometry_columns', '!spatial_ref_sys'];
	for (const ext of params.extensions ?? []) {
		if (ext === 'postgis') tablesConfig.push(...postgisTablesGlobs);
		else assertUnreachable(ext);
	}

	const existingViews = existingEntities.filter((x) => x.type === 'table').map((x) => ({
		schema: x.schema,
		name: x.name,
	}));
	const tablesFilter = prepareTablesFilter(tablesConfig, existingViews);

	const rolesFilter = prepareRolesFilter(params.entities);

	const filter = (it: KitEntity) => {
		if (it.type === 'schema') return schemasFilter(it);
		if (it.type === 'table') {
			if (it.schema === false) return tablesFilter(it);
			return schemasFilter({ type: 'schema', name: it.schema }) && tablesFilter(it);
		}
		if (it.type === 'role') return rolesFilter(it);

		assertUnreachable(it);
	};

	return (it) => {
		const res = filter(it);
		// console.log(res, it);
		return res;
	};
};

const prepareSchemasFitler = (globs: string[], schemasExisting: string[]) => {
	const filterForExisting = (it: Schema) => {
		return !schemasExisting.some((x) => it.name === x);
	};

	const matchers = globs.map((it) => {
		return new Minimatch(it);
	});

	if (matchers.length === 0 && schemasExisting.length === 0) return () => true;
	if (matchers.length === 0) return filterForExisting;

	return (it: Schema) => {
		if (!filterForExisting(it)) return false;

		const flags: boolean[] = [];
		for (let matcher of matchers) {
			if (matcher.negate && !matcher.match(it.name)) {
				flags.push(false);
			} else if (matcher.match(it.name)) {
				flags.push(true);
			}
		}

		if (flags.length > 0) {
			return flags.every(Boolean);
		}

		return false;
	};
};

const prepareTablesFilter = (globs: string[], existingViews: { schema: string | false; name: string }[]) => {
	const existingFilter = (it: Table) => {
		if (it.schema === false) return !existingViews.some((x) => x.name === it.name);
		return !existingViews.some((x) => x.schema === it.schema && x.name === it.name);
	};

	const matchers = globs.map((it) => {
		return new Minimatch(it);
	});
	if (matchers.length === 0 && existingViews.length === 0) return () => true;
	if (matchers.length === 0) return existingFilter;

	const filter = (it: Table) => {
		if (!existingFilter(it)) return false;

		let flags: boolean[] = [];

		for (let matcher of matchers) {
			if (matcher.negate && !matcher.match(it.name)) {
				flags.push(false);
			} else if (matcher.match(it.name)) {
				flags.push(true);
			}
		}

		if (flags.length > 0) {
			return flags.every(Boolean);
		}
		return false;
	};
	return filter;
};

const prepareRolesFilter = (entities: EntitiesFilter) => {
	if (!entities || !entities.roles) return () => false;

	const roles = entities.roles;
	const include: string[] = typeof roles === 'object' ? roles.include ?? [] : [];
	const exclude: string[] = typeof roles === 'object' ? roles.exclude ?? [] : [];
	const provider = typeof roles === 'object' ? roles.provider : undefined;

	if (provider === 'supabase') {
		exclude.push(
			'anon',
			'authenticator',
			'authenticated',
			'service_role',
			'supabase_auth_admin',
			'supabase_storage_admin',
			'dashboard_user',
			'supabase_admin',
		);
	}

	if (provider === 'neon') {
		exclude.push('authenticated', 'anonymous');
	}

	const useRoles: boolean = typeof roles === 'boolean' ? roles : include.length > 0 || exclude.length > 0;

	if (!useRoles) return () => false;
	if (!include.length && !exclude.length) return () => true;

	const rolesFilter: (it: { type: 'role'; name: string }) => boolean = (it) => {
		const notExcluded = !exclude.length || !exclude.includes(it.name);
		const included = !include.length || include.includes(it.name);

		return notExcluded && included;
	};

	return rolesFilter;
};
