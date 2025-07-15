import chalk from 'chalk';
import { count } from 'console';
import { writeFileSync } from 'fs';
import { renderWithTask, TaskView } from 'hanji';
import { render } from 'hanji';
import { join } from 'path';
import { toJsonSnapshot } from 'src/dialects/mysql/snapshot';
import { DB } from 'src/utils';
import { mockResolver } from 'src/utils/mocks';
import { createDDL, interimToDDL } from '../../dialects/mysql/ddl';
import { ddlDiff } from '../../dialects/mysql/diff';
import { fromDatabaseForDrizzle } from '../../dialects/mysql/introspect';
import { ddlToTypeScript } from '../../dialects/mysql/typescript';
import { prepareOutFolder } from '../../utils/utils-node';
import type { Casing, Prefix } from '../validations/common';
import type { MysqlCredentials } from '../validations/mysql';
import { IntrospectProgress, IntrospectStage, IntrospectStatus } from '../views';
import { writeResult } from './generate-common';
import { prepareTablesFilter, relationsToTypeScript } from './pull-common';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: MysqlCredentials,
	tablesFilter: string[],
	prefix: Prefix,
) => {
	const { connectToMySQL } = await import('../connections');
	const { db, database } = await connectToMySQL(credentials);

	const progress = new IntrospectProgress();
	const { schema } = await introspect({
		db,
		database,
		progress,
		progressCallback: (stage, count, status) => {
			progress.update(stage, count, status);
		},
		tablesFilter,
	});
	const { ddl } = interimToDDL(schema);

	const ts = ddlToTypeScript(ddl, schema.viewColumns, casing, "mysql");
	const relations = relationsToTypeScript(ddl.fks.list(), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);

	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relations.file);
	console.log();

	const { snapshots, journal } = prepareOutFolder(out, 'mysql');

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
			snapshot: toJsonSnapshot(ddl, '', []),
			sqlStatements,
			journal,
			renames: [],
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

export const introspect = async (props: {
	db: DB;
	database: string;
	tablesFilter: string[];
	progress: TaskView;
	progressCallback?: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void;
}) => {
	const { db, database, progress, tablesFilter } = props;
	const pcb = props.progressCallback ?? (() => {});
	const filter = prepareTablesFilter(tablesFilter);

	const res = await renderWithTask(progress, fromDatabaseForDrizzle(db, database, filter, pcb));
	return { schema: res };
};
