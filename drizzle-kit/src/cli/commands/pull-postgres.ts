import chalk from 'chalk';
import { writeFileSync } from 'fs';
import type { TaskView } from 'hanji';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
import { toJsonSnapshot } from 'src/dialects/postgres/snapshot';
import type { EntityFilter } from 'src/dialects/pull-utils';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
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
import { ddlToTypeScript as postgresSchemaToTypeScript } from '../../dialects/postgres/typescript';
import { originUUID } from '../../utils';
import type { DB } from '../../utils';
import { prepareOutFolder } from '../../utils/utils-node';
import type { preparePostgresDB } from '../connections';
import { resolver } from '../prompts';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { Casing } from '../validations/common';
import type { PostgresCredentials } from '../validations/postgres';
import type { IntrospectStage, IntrospectStatus } from '../views';
import { IntrospectProgress } from '../views';
import { writeResult } from './generate-common';
import { relationsToTypeScript } from './pull-common';

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

	const progress = new IntrospectProgress(true);
	const entityFilter = prepareEntityFilter('postgresql', filtersConfig, []);

	const { schema: res } = await renderWithTask(
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
	);

	const { ddl: ddl2, errors } = interimToDDL(res);

	if (errors.length > 0) {
		// TODO: print errors
		console.error(errors);
		process.exit(1);
	}

	const ts = postgresSchemaToTypeScript(ddl2, res.viewColumns, casing, 'pg');
	const relationsTs = relationsToTypeScript(postgresToRelationsPull(ddl2), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);
	console.log();

	const { snapshots } = prepareOutFolder(out);
	if (snapshots.length === 0) {
		// const blanks = new Set<string>();
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
