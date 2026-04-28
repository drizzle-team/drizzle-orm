import chalk from 'chalk';
import { writeFileSync } from 'fs';
import type { TaskView } from 'hanji';
import { renderWithTask } from 'hanji';
import { render } from 'hanji';
import { join } from 'path';
import type { EntityFilter } from 'src/dialects/pull-utils';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { createDDL, interimToDDL, mysqlToRelationsPull } from '../../dialects/mysql/ddl';
import { ddlDiff } from '../../dialects/mysql/diff';
import { fromDatabaseForDrizzle } from '../../dialects/mysql/introspect';
import { toJsonSnapshot } from '../../dialects/mysql/snapshot';
import { ddlToTypeScript } from '../../dialects/mysql/typescript';
import type { DB } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import { prepareOutFolder } from '../../utils/utils-node';
import type { connectToMySQL } from '../connections';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { Casing } from '../validations/common';
import type { MysqlCredentials } from '../validations/mysql';
import type { IntrospectStage, IntrospectStatus } from '../views';
import { IntrospectProgress } from '../views';
import { writeResult } from './generate-common';
import { relationsToTypeScript } from './pull-common';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: MysqlCredentials,
	filters: EntitiesFilterConfig,
	migrations: {
		schema: string;
		table: string;
	},
	db?: Awaited<ReturnType<typeof connectToMySQL>>,
) => {
	if (!db) {
		const { connectToMySQL } = await import('../connections');
		db = await connectToMySQL(credentials);
	}

	const filter = prepareEntityFilter('mysql', filters, []);
	const progress = new IntrospectProgress();
	const { schema } = await introspect({
		db: db.db,
		database: db.database,
		progress,
		progressCallback: (stage, count, status) => {
			progress.update(stage, count, status);
		},
		filter,
		migrations,
	});
	const { ddl } = interimToDDL(schema);

	const ts = ddlToTypeScript(ddl, schema.viewColumns, casing, 'mysql');
	const relations = relationsToTypeScript(mysqlToRelationsPull(ddl), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);

	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relations.file);
	console.log();

	const { snapshots } = prepareOutFolder(out);

	if (snapshots.length === 0) {
		const { sqlStatements } = await ddlDiff(
			createDDL(),
			ddl,
			mockResolver(new Set()),
			mockResolver(new Set()),
			mockResolver(new Set()),
			'push',
		);

		writeResult({
			snapshot: toJsonSnapshot(ddl, [], []),
			sqlStatements,
			renames: [],
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

export const introspect = async (props: {
	db: DB;
	database: string;
	filter: EntityFilter;
	progress: TaskView;
	progressCallback?: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void;
	migrations: {
		table: string;
		schema: string;
	};
}) => {
	const { db, database, progress, filter, migrations } = props;
	const pcb = props.progressCallback ?? (() => {});

	const res = await renderWithTask(progress, fromDatabaseForDrizzle(db, database, filter, pcb, migrations));
	return { schema: res };
};
