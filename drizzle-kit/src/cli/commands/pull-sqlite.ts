import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { render, renderWithTask } from 'hanji';
import { Minimatch } from 'minimatch';
import { join } from 'path';
import { applySqliteSnapshotsDiff } from '../../dialects/sqlite/differ';
import { fromDatabase } from '../../dialects/sqlite/introspect';
import { schemaToTypeScript } from '../../dialects/sqlite/typescript';
import { schemaToTypeScript as sqliteSchemaToTypeScript } from '../../dialects/sqlite/typescript';
import { originUUID } from '../../global';
import type { SQLiteDB } from '../../utils';
import { prepareOutFolder } from '../../utils-node';
import { Casing, Prefix } from '../validations/common';
import type { SqliteCredentials } from '../validations/sqlite';
import { IntrospectProgress, ProgressView } from '../views';
import { relationsToTypeScript } from './pull-common';

export const introspectSqlite = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: SqliteCredentials,
	tablesFilter: string[],
	prefix: Prefix,
) => {
	const { connectToSQLite } = await import('../connections');
	const db = await connectToSQLite(credentials);

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
		const { sqlStatements, _meta } = await applySqliteSnapshotsDiff(
			squashSqliteScheme(drySQLite),
			squashSqliteScheme(schema),
			tablesResolver,
			columnsResolver,
			sqliteViewsResolver,
			drySQLite,
			schema,
		);

		writeResult({
			cur: schema,
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
		}] You schema file is ready ➜ ${chalk.bold.underline.blue(schemaFile)} 🚀`,
	);
	render(
		`[${
			chalk.green(
				'✓',
			)
		}] You relations file is ready ➜ ${
			chalk.bold.underline.blue(
				relationsFile,
			)
		} 🚀`,
	);
	process.exit(0);
};

export const sqliteIntrospect = async (
	credentials: SqliteCredentials,
	filters: string[],
	casing: Casing,
) => {
	const { connectToSQLite } = await import('../connections');
	const db = await connectToSQLite(credentials);

	const matchers = filters.map((it) => {
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
	const ts = schemaToTypeScript(schema, casing);
	return { schema, ts };
};

export const sqlitePushIntrospect = async (db: SQLiteDB, filters: string[]) => {
	const matchers = filters.map((it) => {
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

	const progress = new ProgressView(
		'Pulling schema from database...',
		'Pulling schema from database...',
	);
	const res = await renderWithTask(progress, fromDatabase(db, filter));

	const schema = { id: originUUID, prevId: '', ...res } as SQLiteSchema;
	return { schema };
};
