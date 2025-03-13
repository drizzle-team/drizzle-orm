import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { render, renderWithTask } from 'hanji';
import { Minimatch } from 'minimatch';
import { join } from 'path';
import { plural, singular } from 'pluralize';
import { GelSchema } from 'src/serializer/gelSchema';
import { drySingleStore, SingleStoreSchema, squashSingleStoreScheme } from 'src/serializer/singlestoreSchema';
import { assertUnreachable, originUUID } from '../../global';
import { schemaToTypeScript as gelSchemaToTypeScript } from '../../introspect-gel';
import { schemaToTypeScript as mysqlSchemaToTypeScript } from '../../introspect-mysql';
import { paramNameFor, schemaToTypeScript as postgresSchemaToTypeScript } from '../../introspect-pg';
import { schemaToTypeScript as singlestoreSchemaToTypeScript } from '../../introspect-singlestore';
import { schemaToTypeScript as sqliteSchemaToTypeScript } from '../../introspect-sqlite';
import { fromDatabase as fromGelDatabase } from '../../serializer/gelSerializer';
import { dryMySql, MySqlSchema, squashMysqlScheme } from '../../serializer/mysqlSchema';
import { fromDatabase as fromMysqlDatabase } from '../../serializer/mysqlSerializer';
import { dryPg, type PgSchema, squashPgScheme } from '../../serializer/pgSchema';
import { fromDatabase as fromPostgresDatabase } from '../../serializer/pgSerializer';
import { fromDatabase as fromSingleStoreDatabase } from '../../serializer/singlestoreSerializer';
import { drySQLite, type SQLiteSchema, squashSqliteScheme } from '../../serializer/sqliteSchema';
import { fromDatabase as fromSqliteDatabase } from '../../serializer/sqliteSerializer';
import {
	applyLibSQLSnapshotsDiff,
	applyMysqlSnapshotsDiff,
	applyPgSnapshotsDiff,
	applySingleStoreSnapshotsDiff,
	applySqliteSnapshotsDiff,
} from '../../snapshotsDiffer';
import { prepareOutFolder } from '../../utils';
import { Entities } from '../validations/cli';
import type { Casing, Prefix } from '../validations/common';
import { GelCredentials } from '../validations/gel';
import { LibSQLCredentials } from '../validations/libsql';
import type { MysqlCredentials } from '../validations/mysql';
import type { PostgresCredentials } from '../validations/postgres';
import { SingleStoreCredentials } from '../validations/singlestore';
import type { SqliteCredentials } from '../validations/sqlite';
import { IntrospectProgress } from '../views';
import {
	columnsResolver,
	enumsResolver,
	indPolicyResolver,
	mySqlViewsResolver,
	policyResolver,
	roleResolver,
	schemasResolver,
	sequencesResolver,
	sqliteViewsResolver,
	tablesResolver,
	viewsResolver,
	writeResult,
} from './migrate';

export const introspectPostgres = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: PostgresCredentials,
	tablesFilter: string[],
	schemasFilter: string[],
	prefix: Prefix,
	entities: Entities,
) => {
	const { preparePostgresDB } = await import('../connections');
	const db = await preparePostgresDB(credentials);

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

	const progress = new IntrospectProgress(true);

	const res = await renderWithTask(
		progress,
		fromPostgresDatabase(
			db,
			filter,
			schemasFilter,
			entities,
			(stage, count, status) => {
				progress.update(stage, count, status);
			},
		),
	);

	const schema = { id: originUUID, prevId: '', ...res } as PgSchema;
	const ts = postgresSchemaToTypeScript(schema, casing);
	const relationsTs = relationsToTypeScript(schema, casing);
	const { internal, ...schemaWithoutInternals } = schema;

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);
	console.log();

	const { snapshots, journal } = prepareOutFolder(out, 'postgresql');

	if (snapshots.length === 0) {
		const { sqlStatements, _meta } = await applyPgSnapshotsDiff(
			squashPgScheme(dryPg),
			squashPgScheme(schema),
			schemasResolver,
			enumsResolver,
			sequencesResolver,
			policyResolver,
			indPolicyResolver,
			roleResolver,
			tablesResolver,
			columnsResolver,
			viewsResolver,
			dryPg,
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

export const introspectGel = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: GelCredentials | undefined,
	tablesFilter: string[],
	schemasFilter: string[],
	prefix: Prefix,
	entities: Entities,
) => {
	const { prepareGelDB } = await import('../connections');
	const db = await prepareGelDB(credentials);

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

	const progress = new IntrospectProgress(true);

	const res = await renderWithTask(
		progress,
		fromGelDatabase(
			db,
			filter,
			schemasFilter,
			entities,
			(stage, count, status) => {
				progress.update(stage, count, status);
			},
		),
	);

	const schema = { id: originUUID, prevId: '', ...res } as GelSchema;
	const ts = gelSchemaToTypeScript(schema, casing);
	const relationsTs = relationsToTypeScript(schema, casing);
	const { internal, ...schemaWithoutInternals } = schema;

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);
	console.log();

	// const { snapshots, journal } = prepareOutFolder(out, 'gel');

	// if (snapshots.length === 0) {
	// 	const { sqlStatements, _meta } = await applyGelSnapshotsDiff(
	// 		squashGelScheme(dryGel),
	// 		squashGelScheme(schema),
	// 		schemasResolver,
	// 		enumsResolver,
	// 		sequencesResolver,
	// 		policyResolver,
	// 		indPolicyResolver,
	// 		roleResolver,
	// 		tablesResolver,
	// 		columnsResolver,
	// 		viewsResolver,
	// 		dryPg,
	// 		schema,
	// 	);

	// 	writeResult({
	// 		cur: schema,
	// 		sqlStatements,
	// 		journal,
	// 		_meta,
	// 		outFolder: out,
	// 		breakpoints,
	// 		type: 'introspect',
	// 		prefixMode: prefix,
	// 	});
	// } else {
	// 	render(
	// 		`[${
	// 			chalk.blue(
	// 				'i',
	// 			)
	// 		}] No SQL generated, you already have migrations in project`,
	// 	);
	// }

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

export const introspectSingleStore = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: SingleStoreCredentials,
	tablesFilter: string[],
	prefix: Prefix,
) => {
	const { connectToSingleStore } = await import('../connections');
	const { db, database } = await connectToSingleStore(credentials);

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
		fromSingleStoreDatabase(db, database, filter, (stage, count, status) => {
			progress.update(stage, count, status);
		}),
	);

	const schema = { id: originUUID, prevId: '', ...res } as SingleStoreSchema;
	const ts = singlestoreSchemaToTypeScript(schema, casing);
	const { internal, ...schemaWithoutInternals } = schema;

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	console.log();

	const { snapshots, journal } = prepareOutFolder(out, 'postgresql');

	if (snapshots.length === 0) {
		const { sqlStatements, _meta } = await applySingleStoreSnapshotsDiff(
			squashSingleStoreScheme(drySingleStore),
			squashSingleStoreScheme(schema),
			tablesResolver,
			columnsResolver,
			/* singleStoreViewsResolver, */
			drySingleStore,
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
	process.exit(0);
};

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
		fromSqliteDatabase(db, filter, (stage, count, status) => {
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
		fromSqliteDatabase(db, filter, (stage, count, status) => {
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

const withCasing = (value: string, casing: Casing) => {
	if (casing === 'preserve') {
		return value;
	}
	if (casing === 'camel') {
		return value.camelCase();
	}

	assertUnreachable(casing);
};

export const relationsToTypeScript = (
	schema: {
		tables: Record<
			string,
			{
				schema?: string;
				foreignKeys: Record<
					string,
					{
						name: string;
						tableFrom: string;
						columnsFrom: string[];
						tableTo: string;
						schemaTo?: string;
						columnsTo: string[];
						onUpdate?: string | undefined;
						onDelete?: string | undefined;
					}
				>;
			}
		>;
	},
	casing: Casing,
) => {
	const imports: string[] = [];
	const tableRelations: Record<
		string,
		{
			name: string;
			type: 'one' | 'many' | 'through';
			tableFrom: string;
			schemaFrom?: string;
			columnsFrom: string[];
			tableTo: string;
			schemaTo?: string;
			columnsTo: string[];
			relationName?: string;
			tableThrough?: string;
			columnsThroughFrom?: string[];
			columnsThroughTo?: string[];
		}[]
	> = {};

	// Process all foreign keys as before.
	Object.values(schema.tables).forEach((table) => {
		const fks = Object.values(table.foreignKeys);

		// if table has 2 from fk's(one) from different tables
		//   - do not include this table in one
		//   - include many and one of them include through

		// if more - just one to many

		if (fks.length === 2) {
			const [fk1, fk2] = fks;
			// reference to different tables, means it can be through many-many
			const toTable1 = withCasing(paramNameFor(fk1.tableTo, fk1.schemaTo), casing);
			const columnsTo1 = fk1.columnsTo.map((it) => withCasing(it, casing));

			const toTable2 = withCasing(paramNameFor(fk2.tableTo, fk2.schemaTo), casing);
			const columnsTo2 = fk2.columnsTo.map((it) => withCasing(it, casing));

			const tableThrough = withCasing(paramNameFor(fk1.tableFrom, table.schema), casing);
			const tableFrom2 = withCasing(paramNameFor(fk2.tableFrom, table.schema), casing);
			const columnsThroughFrom = fk1.columnsFrom.map((it) => withCasing(it, casing));
			const columnsThroughTo = fk2.columnsFrom.map((it) => withCasing(it, casing));

			if (
				toTable1 !== toTable2
			) {
				if (!tableRelations[toTable1]) {
					tableRelations[toTable1] = [];
				}

				tableRelations[toTable1].push({
					name: plural(toTable2),
					type: 'through',
					tableFrom: toTable1,
					columnsFrom: columnsTo1,
					tableTo: toTable2,
					columnsTo: columnsTo2,
					tableThrough,
					columnsThroughFrom,
					columnsThroughTo,
				});

				if (!tableRelations[toTable2]) {
					tableRelations[toTable2] = [];
				}

				tableRelations[toTable2].push({
					name: plural(toTable1),
					type: 'many',
					tableFrom: tableFrom2,
					columnsFrom: fk2.columnsFrom,
					tableTo: toTable2,
					columnsTo: columnsTo2,
				});
			}
		} else {
			fks.forEach((fk) => {
				const tableNameFrom = paramNameFor(fk.tableFrom, table.schema);
				const tableNameTo = paramNameFor(fk.tableTo, fk.schemaTo);
				const tableFrom = withCasing(tableNameFrom, casing);
				const tableTo = withCasing(tableNameTo, casing);
				const columnsFrom = fk.columnsFrom.map((it) => withCasing(it, casing));
				const columnsTo = fk.columnsTo.map((it) => withCasing(it, casing));

				imports.push(tableTo, tableFrom);

				const keyFrom = tableFrom;
				if (!tableRelations[keyFrom]) {
					tableRelations[keyFrom] = [];
				}

				tableRelations[keyFrom].push({
					name: singular(tableTo),
					type: 'one',
					tableFrom,
					columnsFrom,
					tableTo,
					columnsTo,
				});

				const keyTo = tableTo;
				if (!tableRelations[keyTo]) {
					tableRelations[keyTo] = [];
				}

				tableRelations[keyTo].push({
					name: plural(tableFrom),
					type: 'many',
					tableFrom: tableTo,
					columnsFrom: columnsTo,
					tableTo: tableFrom,
					columnsTo: columnsFrom,
				});
			});
		}
	});

	const importsTs = `import { defineRelations } from "drizzle-orm";\nimport * as schema from "./schema";\n\n`;

	let relationString = `export const relations = defineRelations(schema, (r) => ({`;

	Object.entries(tableRelations).forEach(([table, relations]) => {
		// Adjust duplicate names if needed.
		const preparedRelations = relations.map(
			(relation, relationIndex, originArray) => {
				let name = relation.name;
				let relationName;
				const hasMultipleRelations = originArray.some(
					(it, originIndex) => relationIndex !== originIndex && it.tableTo === relation.tableTo,
				);
				if (hasMultipleRelations) {
					relationName = relation.type === 'one'
						? `${relation.tableFrom}_${relation.columnsFrom.join('_')}_${relation.tableTo}_${
							relation.columnsTo.join('_')
						}`
						: `${relation.tableTo}_${relation.columnsTo.join('_')}_${relation.tableFrom}_${
							relation.columnsFrom.join('_')
						}`;
				}
				const hasDuplicatedRelation = originArray.some(
					(it, originIndex) => relationIndex !== originIndex && it.name === relation.name,
				);
				if (hasDuplicatedRelation) {
					name = `${relation.name}_${
						relation.type === 'one'
							? relation.columnsFrom.join('_')
							: relation.columnsTo.join('_')
					}`;
				}
				return {
					...relation,
					name,
					relationName,
				};
			},
		);

		relationString += `\n\t${table}: {`;
		preparedRelations.forEach((relation) => {
			if (relation.type === 'one') {
				const from = relation.columnsFrom.length === 1
					? `r.${relation.tableFrom}.${relation.columnsFrom[0]}`
					: `[${
						relation.columnsFrom
							.map((it) => `r.${relation.tableFrom}.${it}`)
							.join(', ')
					}]`;
				const to = relation.columnsTo.length === 1
					? `r.${relation.tableTo}.${relation.columnsTo[0]}`
					: `[${
						relation.columnsTo
							.map((it) => `r.${relation.tableTo}.${it}`)
							.join(', ')
					}]`;

				relationString += `\n\t\t${relation.name}: r.one.${relation.tableTo}({\n\t\t\tfrom: ${from},\n\t\t\tto: ${to}`
					+ (relation.relationName ? `,\n\t\t\talias: "${relation.relationName}"` : '')
					+ `\n\t\t}),`;
			} else if (relation.type === 'many') {
				relationString += `\n\t\t${relation.name}: r.many.${relation.tableTo}(`
					+ (relation.relationName ? `{\n\t\t\talias: "${relation.relationName}"\n\t\t}` : '')
					+ `),`;

				// // For many-to-many relations using .through().
				// if (relation.hasThrough) {
				// 	const from = relation.columnsFrom.length === 1
				// 		? `r.${relation.tableFrom}.${
				// 			relation.columnsFrom[0]
				// 		}.through(r.${relation.tableFrom}.${relation.tableFrom})`
				// 		: `[${
				// 			relation.columnsFrom
				// 				.map((it) => `r.${relation.tableFrom}.${it}.through(r.${relation.tableFrom}.${relation.tableFrom})`)
				// 				.join(', ')
				// 		}]`;
				// 	const to = relation.columnsTo.length === 1
				// 		? `r.${relation.tableTo}.${relation.columnsTo[0]}.through(r.${relation.tableTo}.${relation.tableTo})`
				// 		: `[${
				// 			relation.columnsTo
				// 				.map((it) => `r.${relation.tableTo}.${it}.through(r.${relation.tableTo}.${relation.tableTo})`)
				// 				.join(', ')
				// 		}]`;
				// 	relationString +=
				// 		`\n\t\t${relation.name}: r.many.${relation.tableTo}({\n\t\t\tfrom: ${from},\n\t\t\tto: ${to}`
				// 		+ (relation.relationName ? `,\n\t\t\talias: "${relation.relationName}"` : '')
				// 		+ `\n\t\t}),`;
				// } else {
				// 	relationString += `\n\t\t${relation.name}: r.many.${relation.tableTo}({`
				// 		+ (relation.relationName ? `\n\t\t\talias: "${relation.relationName}"` : '')
				// 		+ `\n\t\t}),`;
				// }
			} else {
				const from = relation.columnsThroughFrom!.length === 1
					? `r.${relation.tableFrom}.${relation.columnsFrom[0]}.through(r.${relation.tableThrough}.${
						relation.columnsThroughFrom![0]
					})`
					: `[${
						relation.columnsThroughFrom!
							.map((it) => `r.${relation.tableFrom}.${it}.through(${relation.tableThrough}.${it})`)
							.join(', ')
					}]`;
				const to = relation.columnsThroughTo!.length === 1
					? `r.${relation.tableTo}.${relation.columnsThroughTo![0]}.through(r.${relation.tableThrough}.${
						relation.columnsThroughTo![0]
					})`
					: `[${
						relation.columnsThroughTo!
							.map((it) => `r.${relation.tableTo}.${it}.through(${relation.tableThrough}.${it})`)
							.join(', ')
					}]`;

				relationString += `\n\t\t${relation.name}: r.many.${relation.tableTo}({\n\t\t\tfrom: ${from},\n\t\t\tto: ${to}`
					+ (relation.relationName ? `,\n\t\t\talias: "${relation.relationName}"` : '')
					+ `\n\t\t}),`;
			}
		});
		relationString += `\n\t},`;
	});

	relationString += `\n}))`;

	return {
		file: importsTs + relationString,
	};
};
