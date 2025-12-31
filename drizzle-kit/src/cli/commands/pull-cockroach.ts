import chalk from 'chalk';
import { writeFileSync } from 'fs';
import type { TaskView } from 'hanji';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
import { toJsonSnapshot } from 'src/dialects/cockroach/snapshot';
import type { EntityFilter } from 'src/dialects/pull-utils';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import type {
	CheckConstraint,
	CockroachEntities,
	Column,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PrimaryKey,
	Schema,
	Sequence,
	View,
} from '../../dialects/cockroach/ddl';
import { cockroachToRelationsPull, createDDL, interimToDDL } from '../../dialects/cockroach/ddl';
import { ddlDiff } from '../../dialects/cockroach/diff';
import { fromDatabaseForDrizzle } from '../../dialects/cockroach/introspect';
import { ddlToTypeScript as cockroachSequenceSchemaToTypeScript } from '../../dialects/cockroach/typescript';
import { originUUID } from '../../utils';
import type { DB } from '../../utils';
import { prepareOutFolder } from '../../utils/utils-node';
import type { prepareCockroach } from '../connections';
import { resolver } from '../prompts';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { CockroachCredentials } from '../validations/cockroach';
import type { Casing } from '../validations/common';
import { IntrospectProgress, type IntrospectStage, type IntrospectStatus } from '../views';
import { writeResult } from './generate-common';
import { relationsToTypeScript } from './pull-common';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: CockroachCredentials,
	filters: EntitiesFilterConfig,
	migrations: {
		schema: string;
		table: string;
	},
	db?: Awaited<ReturnType<typeof prepareCockroach>>,
) => {
	if (!db) {
		const { prepareCockroach } = await import('../connections');
		db = await prepareCockroach(credentials);
	}

	const filter = prepareEntityFilter('cockroach', filters, []);

	const progress = new IntrospectProgress(true);
	const task = fromDatabaseForDrizzle(
		db,
		filter,
		(stage, count, status) => {
			progress.update(stage, count, status);
		},
		migrations,
	);
	const res = await renderWithTask(progress, task);

	const { ddl: ddl2, errors } = interimToDDL(res);

	if (errors.length > 0) {
		// TODO: print errors
		console.error(errors);
		process.exit(1);
	}

	const ts = cockroachSequenceSchemaToTypeScript(ddl2, res.viewColumns, casing);
	const relationsTs = relationsToTypeScript(cockroachToRelationsPull(ddl2), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);
	console.log();

	const { snapshots } = prepareOutFolder(out);
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
			snapshot: toJsonSnapshot(ddl2, [originUUID], renames),
			sqlStatements,
			renames,
			outFolder: out,
			breakpoints,
			type: 'introspect',
			snapshots,
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
};

export const introspect = async (
	db: DB,
	filter: EntityFilter,
	progress: TaskView,
	callback: (stage: IntrospectStage, count: number, status: IntrospectStatus) => void = () => {},
	migrations: {
		table: string;
		schema: string;
	},
) => {
	const schema = await renderWithTask(
		progress,
		fromDatabaseForDrizzle(db, filter, callback, migrations),
	);
	return { schema };
};
