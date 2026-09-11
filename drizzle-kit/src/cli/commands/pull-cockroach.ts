import chalk from 'chalk';
import { writeFileSync } from 'fs';
import type { TaskView } from 'hanji';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
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
import { toJsonSnapshot } from '../../dialects/cockroach/snapshot';
import { ddlToTypeScript as cockroachSequenceSchemaToTypeScript } from '../../dialects/cockroach/typescript';
import type { EntityFilter } from '../../dialects/pull-utils';
import { prepareEntityFilter } from '../../dialects/pull-utils';
import { originUUID } from '../../utils';
import type { DB } from '../../utils';
import { prepareOutFolder } from '../../utils/utils-node';
import type { prepareCockroach } from '../connections';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import type { CockroachCredentials } from '../validations/cockroach';
import type { Casing, EntitiesFilterConfig } from '../validations/common';
import { humanLog, IntrospectProgress, type IntrospectStage, type IntrospectStatus } from '../views';
import { writeResult } from './generate-common';
import { relationsToTypeScript, summarizeSchemaMappingErrors } from './pull-common';

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

	const text = outputFormat() === 'text';
	const filter = prepareEntityFilter('cockroach', filters, []);

	let res: Awaited<ReturnType<typeof fromDatabaseForDrizzle>>;
	if (text) {
		const progress = new IntrospectProgress(true);
		const task = fromDatabaseForDrizzle(
			db,
			filter,
			(stage, count, status) => {
				progress.update(stage, count, status);
			},
			migrations,
		);
		res = await renderWithTask(progress, task);
	} else {
		res = await fromDatabaseForDrizzle(db, filter, () => {}, migrations);
	}

	const { ddl: ddl2, errors } = interimToDDL(res);

	if (errors.length > 0) {
		throw new CommandOutputCliError('pull', 'Failed to map the introspected schema', {
			errors: summarizeSchemaMappingErrors(errors),
		});
	}

	const ts = cockroachSequenceSchemaToTypeScript(ddl2, res.viewColumns, casing);
	const relationsTs = relationsToTypeScript(cockroachToRelationsPull(ddl2), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);
	humanLog();

	let snapshotPath: string;
	let migrationPath: string | undefined;
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
			resolver<PrimaryKey>('primary_key'),
			resolver<ForeignKey>('foreign key'),
			'push',
		);

		({ snapshotPath, migrationPath } = writeResult({
			snapshot: toJsonSnapshot(ddl2, [originUUID], renames),
			sqlStatements,
			renames,
			outFolder: out,
			breakpoints,
			type: 'introspect',
			snapshots,
		}));
	} else {
		snapshotPath = snapshots[snapshots.length - 1];
		if (text) {
			render(
				`[${
					chalk.blue(
						'i',
					)
				}] No SQL generated, you already have migrations in project`,
			);
		}
	}

	if (text) {
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
	}

	return {
		schemaPath: schemaFile,
		relationsPath: relationsFile,
		snapshotPath,
		...(migrationPath ? { migrationPath } : {}),
	};
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
