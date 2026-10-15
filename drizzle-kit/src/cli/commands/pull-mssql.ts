import chalk from 'chalk';
import { writeFileSync } from 'fs';
import type { TaskView } from 'hanji';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
import type {
	CheckConstraint,
	Column,
	DefaultConstraint,
	ForeignKey,
	Index,
	MssqlEntities,
	PrimaryKey,
	Schema,
	UniqueConstraint,
	View,
} from '../../dialects/mssql/ddl';
import { createDDL, interimToDDL } from '../../dialects/mssql/ddl';
import { ddlDiff } from '../../dialects/mssql/diff';
import { fromDatabaseForDrizzle } from '../../dialects/mssql/introspect';
import { toJsonSnapshot } from '../../dialects/mssql/snapshot';
import { ddlToTypeScript } from '../../dialects/mssql/typescript';
import type { EntityFilter } from '../../dialects/pull-utils';
import { prepareEntityFilter } from '../../dialects/pull-utils';
import { type DB, originUUID } from '../../utils';
import { prepareOutFolder } from '../../utils/utils-node';
import type { connectToMsSQL } from '../connections';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import type { Casing, EntitiesFilterConfig } from '../validations/common';
import type { MssqlCredentials } from '../validations/mssql';
import { humanLog, IntrospectProgress } from '../views';
import { writeResult } from './generate-common';
import { summarizeSchemaMappingErrors } from './pull-common';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: MssqlCredentials,
	filters: EntitiesFilterConfig,
	migrations: {
		schema: string;
		table: string;
	},
	db?: Awaited<ReturnType<typeof connectToMsSQL>>,
) => {
	if (!db) {
		const { connectToMsSQL } = await import('../connections');
		db = await connectToMsSQL(credentials);
	}

	const text = outputFormat() === 'text';
	const filter = prepareEntityFilter('mssql', filters, []);

	let res: Awaited<ReturnType<typeof fromDatabaseForDrizzle>>;
	if (text) {
		const progress = new IntrospectProgress(true);
		const task = fromDatabaseForDrizzle(
			db.db,
			filter,
			(stage, count, status) => {
				progress.update(stage, count, status);
			},
			migrations,
		);
		res = await renderWithTask(progress, task);
	} else {
		res = await fromDatabaseForDrizzle(db.db, filter, () => {}, migrations);
	}

	const { ddl: ddl2, errors } = interimToDDL(res);

	if (errors.length > 0) {
		throw new CommandOutputCliError('pull', 'Failed to map the introspected schema', {
			errors: summarizeSchemaMappingErrors(errors),
		});
	}

	const ts = ddlToTypeScript(ddl2, res.viewColumns, casing);
	// const relationsTs = relationsToTypeScript(ddl2.fks.list(), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	// const relationsFile = join(out, 'relations.ts');
	// writeFileSync(relationsFile, relationsTs.file);
	humanLog();

	let snapshotPath: string;
	let migrationPath: string | undefined;
	const { snapshots } = prepareOutFolder(out);
	if (snapshots.length === 0) {
		const { sqlStatements, renames } = await ddlDiff(
			createDDL(), // dry ddl
			ddl2,
			resolver<Schema>('schema'),
			resolver<MssqlEntities['tables']>('table'),
			resolver<Column>('column'),
			resolver<View>('view'),
			resolver<UniqueConstraint>('unique', undefined, 'dbo'), // uniques
			resolver<Index>('index', undefined, 'dbo'), // indexes
			resolver<CheckConstraint>('check', undefined, 'dbo'), // checks
			resolver<PrimaryKey>('primary_key', undefined, 'dbo'), // pks
			resolver<ForeignKey>('foreign key', undefined, 'dbo'), // fks
			resolver<DefaultConstraint>('default', undefined, 'dbo'), // defaults
			'default',
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
	}

	return {
		schemaPath: schemaFile,
		snapshotPath,
		...(migrationPath ? { migrationPath } : {}),
	};
};

export const introspect = async (
	db: DB,
	filter: EntityFilter,
	progress: TaskView,
	migrations: {
		table: string;
		schema: string;
	},
) => {
	const schema = await renderWithTask(
		progress,
		fromDatabaseForDrizzle(db, filter, () => {}, migrations),
	);

	return { schema };
};
