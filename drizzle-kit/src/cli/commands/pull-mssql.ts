import chalk from 'chalk';
import { writeFileSync } from 'fs';
import type { TaskView } from 'hanji';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
import { toJsonSnapshot } from 'src/dialects/mssql/snapshot';
import type { EntityFilter } from 'src/dialects/pull-utils';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { prepareOutFolder } from 'src/utils/utils-node';
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
import { ddlToTypeScript } from '../../dialects/mssql/typescript';
import { type DB, originUUID } from '../../utils';
import type { connectToMsSQL } from '../connections';
import { resolver } from '../prompts';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { Casing } from '../validations/common';
import type { MssqlCredentials } from '../validations/mssql';
import { IntrospectProgress, mssqlSchemaError } from '../views';
import { writeResult } from './generate-common';

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

	const filter = prepareEntityFilter('mssql', filters, []);

	const progress = new IntrospectProgress(true);
	const task = fromDatabaseForDrizzle(
		db.db,
		filter,
		(stage, count, status) => {
			progress.update(stage, count, status);
		},
		migrations,
	);

	const res = await renderWithTask(progress, task);

	const { ddl: ddl2, errors } = interimToDDL(res);

	if (errors.length > 0) {
		console.log(errors.map((it) => mssqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const ts = ddlToTypeScript(ddl2, res.viewColumns, casing);
	// const relationsTs = relationsToTypeScript(ddl2.fks.list(), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	// const relationsFile = join(out, 'relations.ts');
	// writeFileSync(relationsFile, relationsTs.file);
	console.log();

	const { snapshots } = prepareOutFolder(out);
	if (snapshots.length === 0) {
		const { sqlStatements, renames } = await ddlDiff(
			createDDL(), // dry ddl
			ddl2,
			resolver<Schema>('schema'),
			resolver<MssqlEntities['tables']>('table'),
			resolver<Column>('column'),
			resolver<View>('view'),
			resolver<UniqueConstraint>('unique', 'dbo'), // uniques
			resolver<Index>('index', 'dbo'), // indexes
			resolver<CheckConstraint>('check', 'dbo'), // checks
			resolver<PrimaryKey>('primary key', 'dbo'), // pks
			resolver<ForeignKey>('foreign key', 'dbo'), // fks
			resolver<DefaultConstraint>('default', 'dbo'), // defaults
			'default',
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
