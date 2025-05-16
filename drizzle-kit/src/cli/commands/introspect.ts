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
			type: 'one' | 'many';
			tableFrom: string;
			schemaFrom?: string;
			columnFrom: string;
			tableTo: string;
			schemaTo?: string;
			columnTo: string;
			relationName?: string;
		}[]
	> = {};

	Object.values(schema.tables).forEach((table) => {
		Object.values(table.foreignKeys).forEach((fk) => {
			const tableNameFrom = paramNameFor(fk.tableFrom, table.schema);
			const tableNameTo = paramNameFor(fk.tableTo, fk.schemaTo);
			const tableFrom = withCasing(tableNameFrom.replace(/:+/g, ''), casing);
			const tableTo = withCasing(tableNameTo.replace(/:+/g, ''), casing);
			const columnFrom = withCasing(fk.columnsFrom[0], casing);
			const columnTo = withCasing(fk.columnsTo[0], casing);

			imports.push(tableTo, tableFrom);

			// const keyFrom = `${schemaFrom}.${tableFrom}`;
			const keyFrom = tableFrom;

			if (!tableRelations[keyFrom]) {
				tableRelations[keyFrom] = [];
			}

			tableRelations[keyFrom].push({
				name: singular(tableTo),
				type: 'one',
				tableFrom,
				columnFrom,
				tableTo,
				columnTo,
			});

			// const keyTo = `${schemaTo}.${tableTo}`;
			const keyTo = tableTo;

			if (!tableRelations[keyTo]) {
				tableRelations[keyTo] = [];
			}

			tableRelations[keyTo].push({
				name: plural(tableFrom),
				type: 'many',
				tableFrom: tableTo,
				columnFrom: columnTo,
				tableTo: tableFrom,
				columnTo: columnFrom,
			});
		});
	});

	const uniqueImports = [...new Set(imports)];

	const importsTs = `import { relations } from "drizzle-orm/relations";\nimport { ${
		uniqueImports.join(
			', ',
		)
	} } from "./schema";\n\n`;

	const relationStatements = Object.entries(tableRelations).map(
		([table, relations]) => {
			const hasOne = relations.some((it) => it.type === 'one');
			const hasMany = relations.some((it) => it.type === 'many');

			// * change relation names if they are duplicated or if there are multiple relations between two tables
			const preparedRelations = relations.map(
				(relation, relationIndex, originArray) => {
					let name = relation.name;
					let relationName;
					const hasMultipleRelations = originArray.some(
						(it, originIndex) => relationIndex !== originIndex && it.tableTo === relation.tableTo,
					);
					if (hasMultipleRelations) {
						relationName = relation.type === 'one'
							? `${relation.tableFrom}_${relation.columnFrom}_${relation.tableTo}_${relation.columnTo}`
							: `${relation.tableTo}_${relation.columnTo}_${relation.tableFrom}_${relation.columnFrom}`;
					}
					const hasDuplicatedRelation = originArray.some(
						(it, originIndex) => relationIndex !== originIndex && it.name === relation.name,
					);
					if (hasDuplicatedRelation) {
						name = `${relation.name}_${relation.type === 'one' ? relation.columnFrom : relation.columnTo}`;
					}
					return {
						...relation,
						name,
						relationName,
					};
				},
			);

			const fields = preparedRelations.map((relation) => {
				if (relation.type === 'one') {
					return `\t${relation.name}: one(${relation.tableTo}, {\n\t\tfields: [${relation.tableFrom}.${relation.columnFrom}],\n\t\treferences: [${relation.tableTo}.${relation.columnTo}]${
						relation.relationName
							? `,\n\t\trelationName: "${relation.relationName}"`
							: ''
					}\n\t}),`;
				} else {
					return `\t${relation.name}: many(${relation.tableTo}${
						relation.relationName
							? `, {\n\t\trelationName: "${relation.relationName}"\n\t}`
							: ''
					}),`;
				}
			});

			return `export const ${table}Relations = relations(${table}, ({${hasOne ? 'one' : ''}${
				hasOne && hasMany ? ', ' : ''
			}${hasMany ? 'many' : ''}}) => ({\n${fields.join('\n')}\n}));`;
		},
	);

	return {
		file: importsTs + relationStatements.join('\n\n'),
	};
};
