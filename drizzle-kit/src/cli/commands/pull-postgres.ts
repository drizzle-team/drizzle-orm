import { render, renderWithTask } from 'hanji';
import { Minimatch } from 'minimatch';
import { ddlDif } from '../../dialects/postgres/diff';
import { fromDatabase } from '../../dialects/postgres/introspect';
import { ddlToTypeScript as postgresSchemaToTypeScript } from '../../dialects/postgres/typescript';
import type { DB } from '../../utils';
import { prepareOutFolder } from '../../utils-node';
import { Entities } from '../validations/cli';
import type { Casing, Prefix } from '../validations/common';
import type { PostgresCredentials } from '../validations/postgres';
import { ProgressView } from '../views';
import { IntrospectProgress } from '../views';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { originUUID } from 'src/global';
import { relationsToTypeScript } from './pull-common';
import chalk from 'chalk';
import { interimToDDL } from 'src/dialects/postgres/ddl';

export const introspectPostgres = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: PostgresCredentials,
	tablesFilter: string[],
	schemasFilters: string[],
	prefix: Prefix,
	entities: Entities,
) => {
	const { preparePostgresDB } = await import('../connections');
	const db = await preparePostgresDB(credentials);

	const matchers = tablesFilter.map((it) => {
		return new Minimatch(it);
	});

	const filter = (tableName: string) => {
		if (matchers.length === 0) return true;

		let flags: boolean[] = [];

		for (let matcher of matchers) {
			if (matcher.negate) {
				if (!matcher.match(tableName)) {
					flags.push(false);
				}
			}

			if (matcher.match(tableName)) {
				flags.push(true);
			}
		}

		if (flags.length > 0) {
			return flags.every(Boolean);
		}
		return false;
	};

	const schemaFilter = (it: string) => {
		return schemasFilters.some((x) => x === it);
	};

	const progress = new IntrospectProgress(true);

	const res = await renderWithTask(
		progress,
		fromDatabase(
			db,
			filter,
			schemaFilter,
			entities,
			(stage, count, status) => {
				progress.update(stage, count, status);
			},
		),
	);

	const ddl = interimToDDL(res)

	const ts = postgresSchemaToTypeScript(ddl, casing);
	const relationsTs = relationsToTypeScript(ddl, casing);
	const { internal, ...schemaWithoutInternals } = schema;

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);
	console.log();

	const { snapshots, journal } = prepareOutFolder(out, 'postgresql');
	if (snapshots.length === 0) {
		const { sqlStatements, _meta } = await ddlDif(
			squashPgScheme(dryPg, squasher),
			squashPgScheme(schema, squasher),
			schemasResolver,
			enumsResolver,
			sequencesResolver,
			policyResolver,
			indPolicyResolver,
			roleResolver,
			tablesResolver,
			columnsResolver,
			viewsResolver,
			uniqueResolver,
			indexesResolver,
			dryPg,
			schema,
			squasher,
		);

		writeResult({
			cur: schema,
			sqlStatements,
			journal,
			_meta,
			outFolder: out,
			breakpoints,
			type: 'introspect',
			prefixMode: prefix,
		});
	} else {
		render(
			`[${
				chalk.blue(
					'i',
				)
			}] No SQL generated, you already have migrations in project`,
		);
	}

	render(
		`[${
			chalk.green(
				'✓',
			)
		}] Your schema file is ready ➜ ${chalk.bold.underline.blue(schemaFile)} 🚀`,
	);
	render(
		`[${
			chalk.green(
				'✓',
			)
		}] Your relations file is ready ➜ ${
			chalk.bold.underline.blue(
				relationsFile,
			)
		} 🚀`,
	);
	process.exit(0);
};

export const pgPushIntrospect = async (
	db: DB,
	filters: string[],
	schemaFilters: string[],
	entities: Entities,
) => {
	const matchers = filters.map((it) => {
		return new Minimatch(it);
	});

	const filter = (tableName: string) => {
		if (matchers.length === 0) return true;

		let flags: boolean[] = [];

		for (let matcher of matchers) {
			if (matcher.negate) {
				if (!matcher.match(tableName)) {
					flags.push(false);
				}
			}

			if (matcher.match(tableName)) {
				flags.push(true);
			}
		}

		if (flags.length > 0) {
			return flags.every(Boolean);
		}
		return false;
	};
	const progress = new ProgressView(
		'Pulling schema from database...',
		'Pulling schema from database...',
	);
	const schemaFilter = (it: string) => {
		return schemaFilters.some((x) => x === it);
	};
	const res = await renderWithTask(
		progress,
		fromDatabase(db, filter, schemaFilter, entities, undefined),
	);

	return { schema: res };
};
