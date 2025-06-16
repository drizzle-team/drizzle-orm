import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { render, renderWithTask, TaskView } from 'hanji';
import { Minimatch } from 'minimatch';
import { join } from 'path';
import { toJsonSnapshot } from 'src/dialects/cockroach/snapshot';
import {
	CheckConstraint,
	CockroachEntities,
	Column,
	createDDL,
	Enum,
	ForeignKey,
	Index,
	interimToDDL,
	Policy,
	PrimaryKey,
	Schema,
	Sequence,
	View,
} from '../../dialects/cockroach/ddl';
import { ddlDiff } from '../../dialects/cockroach/diff';
import { fromDatabaseForDrizzle } from '../../dialects/cockroach/introspect';
import { ddlToTypeScript as cockroachSequenceSchemaToTypeScript } from '../../dialects/cockroach/typescript';
import { originUUID } from '../../utils';
import type { DB } from '../../utils';
import { prepareOutFolder } from '../../utils/utils-node';
import { resolver } from '../prompts';
import type { Entities } from '../validations/cli';
import type { CockroachCredentials } from '../validations/cockroach';
import type { Casing, Prefix } from '../validations/common';
import { IntrospectProgress } from '../views';
import { writeResult } from './generate-common';
import { prepareTablesFilter, relationsToTypeScript } from './pull-common';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: CockroachCredentials,
	tablesFilter: string[],
	schemasFilters: string[],
	prefix: Prefix,
	entities: Entities,
) => {
	const { prepareCockroach } = await import('../connections');
	const db = await prepareCockroach(credentials);

	const filter = prepareTablesFilter(tablesFilter);
	const schemaFilter = (it: string) => schemasFilters.some((x) => x === it);

	const progress = new IntrospectProgress(true);
	const res = await renderWithTask(
		progress,
		fromDatabaseForDrizzle(
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
		console.error(errors);
		process.exit(1);
	}

	const ts = cockroachSequenceSchemaToTypeScript(ddl2, res.viewColumns, casing);
	const relationsTs = relationsToTypeScript(ddl2.fks.list(), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);
	console.log();

	const { snapshots, journal } = prepareOutFolder(out, 'cockroach');
	if (snapshots.length === 0) {
		const { sqlStatements, renames } = await ddlDiff(
			createDDL(), // dry ddl
			ddl2,
			resolver<Schema>('schema'),
			resolver<Enum>('enum'),
			resolver<Sequence>('sequence'),
			resolver<Policy>('policy'),
			resolver<CockroachEntities['tables']>('table'),
			resolver<Column>('column'),
			resolver<View>('view'),
			resolver<Index>('index'),
			resolver<CheckConstraint>('check'),
			resolver<PrimaryKey>('primary key'),
			resolver<ForeignKey>('foreign key'),
			'push',
		);

		writeResult({
			snapshot: toJsonSnapshot(ddl2, originUUID, renames),
			sqlStatements,
			journal,
			renames,
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

export const introspect = async (
	db: DB,
	filters: string[],
	schemaFilters: string[] | ((x: string) => boolean),
	entities: Entities,
	progress: TaskView,
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

	const schemaFilter = typeof schemaFilters === 'function'
		? schemaFilters
		: (it: string) => schemaFilters.some((x) => x === it);
	const schema = await renderWithTask(progress, fromDatabaseForDrizzle(db, filter, schemaFilter, entities));
	return { schema };
};
