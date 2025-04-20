import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { render, renderWithTask } from 'hanji';
import { Minimatch } from 'minimatch';
import { join } from 'path';
import { mockResolver } from 'src/utils/mocks';
import {
	Column,
	createDDL,
	Enum,
	interimToDDL,
	Policy,
	PostgresEntities,
	Role,
	Schema,
	Sequence,
	View,
} from '../../dialects/postgres/ddl';
import { ddlDiff } from '../../dialects/postgres/diff';
import { fromDatabase } from '../../dialects/postgres/introspect';
import { ddlToTypeScript as postgresSchemaToTypeScript } from '../../dialects/postgres/typescript';
import type { DB } from '../../utils';
import { prepareOutFolder } from '../../utils-node';
import { resolver } from '../prompts';
import type { Entities } from '../validations/cli';
import type { Casing, Prefix } from '../validations/common';
import type { PostgresCredentials } from '../validations/postgres';
import { err, ProgressView } from '../views';
import { IntrospectProgress } from '../views';
import { writeResult } from './generate-common';
import { relationsToTypeScript } from './pull-common';

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

	const { ddl: ddl2, errors } = interimToDDL(res);

	if (errors.length > 0) {
		// TODO: print errors
		process.exit(1);
	}

	const ts = postgresSchemaToTypeScript(ddl2, casing);
	const relationsTs = relationsToTypeScript(ddl2.fks.list(), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);
	console.log();

	const { snapshots, journal } = prepareOutFolder(out, 'postgresql');
	if (snapshots.length === 0) {
		const blanks = new Set<string>();
		const { sqlStatements, _meta } = await ddlDiff(
			createDDL(), // dry ddl
			ddl2,
			resolver<Schema>('schema'),
			resolver<Enum>('enum'),
			resolver<Sequence>('sequence'),
			resolver<Policy>('policy'),
			resolver<Role>('role'),
			resolver<PostgresEntities['tables']>('table'),
			resolver<Column>('column'),
			resolver<View>('view'),
			// TODO: handle all renames
			mockResolver(blanks), // uniques
			mockResolver(blanks), // indexes
			mockResolver(blanks), // checks
			mockResolver(blanks), // pks
			mockResolver(blanks), // fks
			'push',
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
	const schema = await renderWithTask(
		progress,
		fromDatabaseForDrizzle(db, filter, schemaFilter, entities),
	);

	return { schema };
};

export const fromDatabaseForDrizzle = async (
	db: DB,
	tableFilter: (it: string) => boolean,
	schemaFilters: (it: string) => boolean,
	entities?: Entities,
) => {
	const res = await fromDatabase(db, tableFilter, schemaFilters, entities, undefined);
	res.schemas = res.schemas.filter((it) => it.name !== 'public');
	return res;
};
