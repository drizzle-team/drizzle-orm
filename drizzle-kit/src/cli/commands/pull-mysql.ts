import chalk from 'chalk';
import { writeFileSync } from 'fs';
import type { TaskView } from 'hanji';
import { renderWithTask } from 'hanji';
import { render } from 'hanji';
import { join } from 'path';
import type { EntityFilter } from 'src/dialects/pull-utils';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { createDDL, interimToDDL } from '../../dialects/mysql/ddl';
import { ddlDiff } from '../../dialects/mysql/diff';
import { fromDatabaseForDrizzle } from '../../dialects/mysql/introspect';
import { toJsonSnapshot } from '../../dialects/mysql/snapshot';
import { ddlToTypeScript } from '../../dialects/mysql/typescript';
import type { DB } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import { prepareOutFolder } from '../../utils/utils-node';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { Casing, Prefix } from '../validations/common';
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
	prefix: Prefix,
) => {
	const { connectToMySQL } = await import('../connections');
	const { db, database } = await connectToMySQL(credentials);

	const filter = prepareEntityFilter('mysql', filters, []);
	const progress = new IntrospectProgress();
	const { schema } = await introspect({
		db,
		database,
		progress,
		progressCallback: (stage, count, status) => {
			progress.update(stage, count, status);
		},
		filter,
	});
	const { ddl } = interimToDDL(schema);

	const ts = ddlToTypeScript(ddl, schema.viewColumns, casing, 'mysql');
	const relations = relationsToTypeScript(ddl.fks.list(), casing);

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
			prefixMode: prefix,
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
	process.exit(0);
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
}) => {
	const { db, database, progress, filter } = props;
	const pcb = props.progressCallback ?? (() => {});

	const res = await renderWithTask(progress, fromDatabaseForDrizzle(db, database, filter, pcb));
	return { schema: res };
};
