import { Minimatch } from 'minimatch';
import type { EntitiesFilter, ExtensionsFilter, SchemasFilter, TablesFilter } from 'src/cli/validations/cli';
import { assertUnreachable } from 'src/utils';
import type { Dialect } from 'src/utils/schemaValidator';

export type KitEntity =
	| { type: 'schema'; name: string }
	| { type: 'table'; schema: string | false; name: string }
	| { type: 'role'; name: string };

export type EntityFilter = (it: KitEntity) => boolean;

export const prepareEntityFilter = (
	dialect: Dialect,
	params: {
		tables: TablesFilter;
		schemas: SchemasFilter;
		drizzleSchemas: string[];
		entities: EntitiesFilter;
		extensions: ExtensionsFilter;
	},
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

	const allowedSchemas = [...schemasConfig];

	// if (allowedSchemas.length > 0) {
	// 	const toCheck = params.drizzleSchemas;
	// 	const missing = toCheck.filter((it) => !allowedSchemas.includes(it));
	// 	if (missing.length > 0) {
	// 		const missingArr = missing.map((it) => chalk.underline(it)).join(', ');
	// 		const allowedArr = allowedSchemas.map((it) => chalk.underline(it)).join(', ');
	// 		console.log(
	// 			`[${chalk.red('x')}] ${missingArr} schemas missing in drizzle config file "schemaFilter": [${allowedArr}]`,
	// 		);
	// 		// TODO: write a guide and link here
	// 		process.exit(1);
	// 	}
	// } else {
	// 	allowedSchemas.push(...params.drizzleSchemas);
	// }

	const schemasFilter = prepareSchemasFitler(allowedSchemas);

	const postgisTablesGlobs = ['!geography_columns', '!geometry_columns', '!spatial_ref_sys'];
	for (const ext of params.extensions ?? []) {
		if (ext === 'postgis') tablesConfig.push(...postgisTablesGlobs);
		else assertUnreachable(ext);
	}

	const tablesFilter = prepareTablesFilter(tablesConfig);

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

const prepareSchemasFitler = (globs: string[]) => {
	const matchers = globs.map((it) => {
		return new Minimatch(it);
	});
	if (matchers.length === 0) return () => true;

	return (it: { type: 'schema'; name: string }) => {
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
};

const prepareTablesFilter = (globs: string[]) => {
	const matchers = globs.map((it) => {
		return new Minimatch(it);
	});
	if (matchers.length === 0) return () => true;

	const filter = (it: { type: 'table'; schema: string | false; name: string }) => {
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
