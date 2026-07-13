import chalk from 'chalk';
import { writeFileSync } from 'fs';
import type { TaskView } from 'hanji';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
import type {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PostgresEntities,
	PrimaryKey,
	Privilege,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from '../../dialects/postgres/ddl';
import { createDDL, interimToDDL, postgresToRelationsPull } from '../../dialects/postgres/ddl';
import { ddlDiff } from '../../dialects/postgres/diff';
import { fromDatabaseForDrizzle } from '../../dialects/postgres/introspect';
import { toJsonSnapshot } from '../../dialects/postgres/snapshot';
import { ddlToTypeScript as postgresSchemaToTypeScript } from '../../dialects/postgres/typescript';
import type { EntityFilter } from '../../dialects/pull-utils';
import { prepareEntityFilter } from '../../dialects/pull-utils';
import { originUUID } from '../../utils';
import type { DB } from '../../utils';
import { prepareOutFolder } from '../../utils/utils-node';
import type { preparePostgresDB } from '../connections';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import type { EntitiesFilterConfig } from '../validations/common';
import type { Casing } from '../validations/common';
import type { PostgresCredentials } from '../validations/postgres';
import type { IntrospectStage, IntrospectStatus } from '../views';
import { humanLog, IntrospectProgress } from '../views';
import { writeResult } from './generate-common';
import { relationsToTypeScript, summarizeSchemaMappingErrors } from './pull-common';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: PostgresCredentials,
	filtersConfig: EntitiesFilterConfig,
	migrations: {
		table: string;
		schema: string;
	},
	db?: Awaited<ReturnType<typeof preparePostgresDB>>,
) => {
	if (!db) {
		const { preparePostgresDB } = await import('../connections');
		db = await preparePostgresDB(credentials);
	}

	const text = outputFormat() === 'text';
	const entityFilter = prepareEntityFilter('postgresql', filtersConfig, []);

	let res: Awaited<ReturnType<typeof fromDatabaseForDrizzle>>;
	if (text) {
		const progress = new IntrospectProgress(true);
		({ schema: res } = await renderWithTask(
			progress,
			introspect(
				db,
				entityFilter,
				progress,
				(stage, count, status) => {
					progress.update(stage, count, status);
				},
				migrations,
			),
		));
	} else {
		res = await fromDatabaseForDrizzle(db, entityFilter, () => {}, migrations);
	}

	const { ddl: ddl2, errors } = interimToDDL(res);

	if (errors.length > 0) {
		throw new CommandOutputCliError('pull', 'Failed to map the introspected schema', {
			errors: summarizeSchemaMappingErrors(errors),
		});
	}

	const ts = postgresSchemaToTypeScript(ddl2, res.viewColumns, casing);
	const relationsTs = relationsToTypeScript(postgresToRelationsPull(ddl2), casing);

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
			resolver<Role>('role'),
			resolver<Privilege>('privilege'),
			resolver<PostgresEntities['tables']>('table'),
			resolver<Column>('column'),
			resolver<View>('view'),
			resolver<UniqueConstraint>('unique'),
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
		schema: string;
		table: string;
	},
) => {
	const schema = await renderWithTask(
		progress,
		fromDatabaseForDrizzle(db, filter, callback, migrations),
	);
	return { schema };
};
