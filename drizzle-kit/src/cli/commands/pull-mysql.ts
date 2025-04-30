import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { renderWithTask, TaskView } from 'hanji';
import { render } from 'hanji';
import { Minimatch } from 'minimatch';
import { join } from 'path';
import { toJsonSnapshot } from 'src/dialects/mysql/snapshot';
import { mockResolver } from 'src/utils/mocks';
import { Column, createDDL, interimToDDL, Table, View } from '../../dialects/mysql/ddl';
import { diffDDL } from '../../dialects/mysql/diff';
import { fromDatabase } from '../../dialects/mysql/introspect';
import { ddlToTypeScript } from '../../dialects/mysql/typescript';
import type { DB } from '../../utils';
import { prepareOutFolder } from '../../utils-node';
import { resolver } from '../prompts';
import type { Casing, Prefix } from '../validations/common';
import type { MysqlCredentials } from '../validations/mysql';
import { IntrospectProgress } from '../views';
import { writeResult } from './generate-common';
import { relationsToTypeScript } from './pull-common';

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

	const matchers = tablesFilter.map((it) => {
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

	const progress = new IntrospectProgress();
	const res = await renderWithTask(
		progress,
		fromDatabase(db, database, filter, (stage, count, status) => {
			progress.update(stage, count, status);
		}),
	);
	const { ddl } = interimToDDL(res);

	const ts = ddlToTypeScript(ddl, res.viewColumns, casing);
	const relations = relationsToTypeScript(ddl.fks.list(), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);

	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relations.file);
	console.log();

	const { snapshots, journal } = prepareOutFolder(out, 'mysql');

	if (snapshots.length === 0) {
		const { sqlStatements } = await diffDDL(
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
