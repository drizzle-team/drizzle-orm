import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { render, renderWithTask } from 'hanji';
import { Minimatch } from 'minimatch';
import { join } from 'path';
import { fromDatabase } from '../../dialects/sqlite/introspect';
import { ddlToTypescript as sqliteSchemaToTypeScript } from '../../dialects/sqlite/typescript';
import { originUUID } from '../../global';
import { applyLibSQLSnapshotsDiff } from '../../snapshot-differ/libsql';
import { prepareOutFolder } from '../../utils-node';
import type { Casing, Prefix } from '../validations/common';
import { LibSQLCredentials } from '../validations/libsql';
import { IntrospectProgress } from '../views';
import { writeResult } from './generate-common';
import { relationsToTypeScript } from './pull-common';

export const introspectLibSQL = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: LibSQLCredentials,
	tablesFilter: string[],
	prefix: Prefix,
) => {
	const { connectToLibSQL } = await import('../connections');
	const db = await connectToLibSQL(credentials);

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
		fromDatabase(db, filter, (stage, count, status) => {
			progress.update(stage, count, status);
		}),
	);

	const schema = { id: originUUID, prevId: '', ...res } as SQLiteSchema;
	const ts = sqliteSchemaToTypeScript(schema, casing);
	const relationsTs = relationsToTypeScript(schema, casing);

	// check orm and orm-pg api version

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);
	console.log();

	const { snapshots, journal } = prepareOutFolder(out, 'sqlite');

	if (snapshots.length === 0) {
		const { sqlStatements, _meta } = await applyLibSQLSnapshotsDiff(
			squashSqliteScheme(drySQLite),
			squashSqliteScheme(schema),
			tablesResolver,
			columnsResolver,
			sqliteViewsResolver,
			drySQLite,
			schema,
		);

		writeResult({
			snapshot: schema,
			sqlStatements,
			journal,
			_meta,
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
