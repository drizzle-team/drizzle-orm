import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { renderWithTask } from 'hanji';
import { render } from 'hanji';
import { Minimatch } from 'minimatch';
import { join } from 'path';
import { originUUID } from '../../global';
import { schemaToTypeScript as mysqlSchemaToTypeScript } from '../../introspect-mysql';
import type { MySqlSchema } from '../../serializer/mysqlSchema';
import { dryMySql, squashMysqlScheme } from '../../serializer/mysqlSchema';
import { fromDatabase } from '../../serializer/mysqlSerializer';
import { fromDatabase as fromMysqlDatabase } from '../../serializer/mysqlSerializer';
import { applyMysqlSnapshotsDiff } from '../../snapshot-differ/mysql';
import type { DB } from '../../utils';
import { prepareOutFolder } from '../../utils-node';
import type { Casing, Prefix } from '../validations/common';
import type { MysqlCredentials } from '../validations/mysql';
import { ProgressView } from '../views';
import { IntrospectProgress } from '../views';
import { writeResult } from './generate-common';
import { relationsToTypeScript } from './pull-common';

export const introspectMysql = async (
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
		fromMysqlDatabase(db, database, filter, (stage, count, status) => {
			progress.update(stage, count, status);
		}),
	);

	const schema = { id: originUUID, prevId: '', ...res } as MySqlSchema;
	const ts = mysqlSchemaToTypeScript(schema, casing);
	const relationsTs = relationsToTypeScript(schema, casing);
	const { internal, ...schemaWithoutInternals } = schema;

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);
	console.log();

	const { snapshots, journal } = prepareOutFolder(out, 'mysql');

	if (snapshots.length === 0) {
		const { sqlStatements, _meta } = await applyMysqlSnapshotsDiff(
			squashMysqlScheme(dryMySql),
			squashMysqlScheme(schema),
			tablesResolver,
			columnsResolver,
			mySqlViewsResolver,
			uniqueResolver,
			dryMySql,
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

export const mysqlPushIntrospect = async (
	db: DB,
	databaseName: string,
	filters: string[],
) => {
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
	const res = await renderWithTask(
		progress,
		fromDatabase(db, databaseName, filter),
	);

	const schema = { id: originUUID, prevId: '', ...res } as MySqlSchema;
	const { internal, ...schemaWithoutInternals } = schema;
	return { schema: schemaWithoutInternals };
};
