import fs from 'fs';
import {
	prepareMySqlDbPushSnapshot,
	prepareMySqlMigrationSnapshot,
	preparePgDbPushSnapshot,
	preparePgMigrationSnapshot,
	prepareSingleStoreDbPushSnapshot,
	prepareSingleStoreMigrationSnapshot,
	prepareSQLiteDbPushSnapshot,
	prepareSqliteMigrationSnapshot,
} from '../../migrationPreparator';

import chalk from 'chalk';
import { render } from 'hanji';
import path, { join } from 'path';
import { SingleStoreSchema, singlestoreSchema, squashSingleStoreScheme } from 'src/serializer/singlestoreSchema';
import { TypeOf } from 'zod';
import type { CommonSchema } from '../../schemaValidator';
import { MySqlSchema, mysqlSchema, squashMysqlScheme, ViewSquashed } from '../../serializer/mysqlSchema';
import { PgSchema, pgSchema, Policy, Role, squashPgScheme, View } from '../../serializer/pgSchema';
import { SQLiteSchema, sqliteSchema, squashSqliteScheme, View as SQLiteView } from '../../serializer/sqliteSchema';
import {
	applyLibSQLSnapshotsDiff,
	applyMysqlSnapshotsDiff,
	applyPgSnapshotsDiff,
	applySingleStoreSnapshotsDiff,
	applySqliteSnapshotsDiff,
	Column,
	ColumnsResolverInput,
	ColumnsResolverOutput,
	Enum,
	PolicyResolverInput,
	PolicyResolverOutput,
	ResolverInput,
	ResolverOutput,
	ResolverOutputWithMoved,
	RolesResolverInput,
	RolesResolverOutput,
	Sequence,
	Table,
	TablePolicyResolverInput,
	TablePolicyResolverOutput,
} from '../../snapshotsDiffer';
import { assertV1OutFolder, Journal, prepareMigrationFolder } from '../../utils';
import { prepareMigrationMetadata } from '../../utils/words';
import { CasingType, Driver, Prefix } from '../validations/common';
import { withStyle } from '../validations/outputs';
import {
	isRenamePromptItem,
	RenamePropmtItem,
	ResolveColumnSelect,
	ResolveSchemasSelect,
	ResolveSelect,
	ResolveSelectNamed,
	schema,
} from '../views';
import { ExportConfig, GenerateConfig } from './utils';

export type Named = {
	name: string;
};

export type NamedWithSchema = {
	name: string;
	schema: string;
};

export const schemasResolver = async (
	input: ResolverInput<Table>,
): Promise<ResolverOutput<Table>> => {
	try {
		const { created, deleted, renamed } = await promptSchemasConflict(
			input.created,
			input.deleted,
		);

		return { created: created, deleted: deleted, renamed: renamed };
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const tablesResolver = async (
	input: ResolverInput<Table>,
): Promise<ResolverOutputWithMoved<Table>> => {
	try {
		const { created, deleted, moved, renamed } = await promptNamedWithSchemasConflict(
			input.created,
			input.deleted,
			'table',
		);

		return {
			created: created,
			deleted: deleted,
			moved: moved,
			renamed: renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const viewsResolver = async (
	input: ResolverInput<View>,
): Promise<ResolverOutputWithMoved<View>> => {
	try {
		const { created, deleted, moved, renamed } = await promptNamedWithSchemasConflict(
			input.created,
			input.deleted,
			'view',
		);

		return {
			created: created,
			deleted: deleted,
			moved: moved,
			renamed: renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const mySqlViewsResolver = async (
	input: ResolverInput<ViewSquashed & { schema: '' }>,
): Promise<ResolverOutputWithMoved<ViewSquashed>> => {
	try {
		const { created, deleted, moved, renamed } = await promptNamedWithSchemasConflict(
			input.created,
			input.deleted,
			'view',
		);

		return {
			created: created,
			deleted: deleted,
			moved: moved,
			renamed: renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

/* export const singleStoreViewsResolver = async (
	input: ResolverInput<SingleStoreViewSquashed & { schema: '' }>,
): Promise<ResolverOutputWithMoved<SingleStoreViewSquashed>> => {
	try {
		const { created, deleted, moved, renamed } = await promptNamedWithSchemasConflict(
			input.created,
			input.deleted,
			'view',
		);

		return {
			created: created,
			deleted: deleted,
			moved: moved,
			renamed: renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
}; */

export const sqliteViewsResolver = async (
	input: ResolverInput<SQLiteView & { schema: '' }>,
): Promise<ResolverOutputWithMoved<SQLiteView>> => {
	try {
		const { created, deleted, moved, renamed } = await promptNamedWithSchemasConflict(
			input.created,
			input.deleted,
			'view',
		);

		return {
			created: created,
			deleted: deleted,
			moved: moved,
			renamed: renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const sequencesResolver = async (
	input: ResolverInput<Sequence>,
): Promise<ResolverOutputWithMoved<Sequence>> => {
	try {
		const { created, deleted, moved, renamed } = await promptNamedWithSchemasConflict(
			input.created,
			input.deleted,
			'sequence',
		);

		return {
			created: created,
			deleted: deleted,
			moved: moved,
			renamed: renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const roleResolver = async (
	input: RolesResolverInput<Role>,
): Promise<RolesResolverOutput<Role>> => {
	const result = await promptNamedConflict(
		input.created,
		input.deleted,
		'role',
	);
	return {
		created: result.created,
		deleted: result.deleted,
		renamed: result.renamed,
	};
};

export const policyResolver = async (
	input: TablePolicyResolverInput<Policy>,
): Promise<TablePolicyResolverOutput<Policy>> => {
	const result = await promptColumnsConflicts(
		input.tableName,
		input.created,
		input.deleted,
	);
	return {
		tableName: input.tableName,
		schema: input.schema,
		created: result.created,
		deleted: result.deleted,
		renamed: result.renamed,
	};
};

export const indPolicyResolver = async (
	input: PolicyResolverInput<Policy>,
): Promise<PolicyResolverOutput<Policy>> => {
	const result = await promptNamedConflict(
		input.created,
		input.deleted,
		'policy',
	);
	return {
		created: result.created,
		deleted: result.deleted,
		renamed: result.renamed,
	};
};

export const enumsResolver = async (
	input: ResolverInput<Enum>,
): Promise<ResolverOutputWithMoved<Enum>> => {
	try {
		const { created, deleted, moved, renamed } = await promptNamedWithSchemasConflict(
			input.created,
			input.deleted,
			'enum',
		);

		return {
			created: created,
			deleted: deleted,
			moved: moved,
			renamed: renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const columnsResolver = async (
	input: ColumnsResolverInput<Column>,
): Promise<ColumnsResolverOutput<Column>> => {
	const result = await promptColumnsConflicts(
		input.tableName,
		input.created,
		input.deleted,
	);
	return {
		tableName: input.tableName,
		schema: input.schema,
		created: result.created,
		deleted: result.deleted,
		renamed: result.renamed,
	};
};

export const prepareAndMigratePg = async (config: GenerateConfig) => {
	const outFolder = config.out;
	const schemaPath = config.schema;
	const casing = config.casing;

	try {
		assertV1OutFolder(outFolder);

		const { snapshots, journal } = prepareMigrationFolder(
			outFolder,
			'postgresql',
		);

		const { prev, cur, custom } = await preparePgMigrationSnapshot(
			snapshots,
			schemaPath,
			casing,
		);

		const validatedPrev = pgSchema.parse(prev);
		const validatedCur = pgSchema.parse(cur);

		if (config.custom) {
			writeResult({
				cur: custom,
				sqlStatements: [],
				journal,
				outFolder,
				name: config.name,
				breakpoints: config.breakpoints,
				type: 'custom',
				prefixMode: config.prefix,
			});
			return;
		}

		const squashedPrev = squashPgScheme(validatedPrev);
		const squashedCur = squashPgScheme(validatedCur);

		const { sqlStatements, _meta } = await applyPgSnapshotsDiff(
			squashedPrev,
			squashedCur,
			schemasResolver,
			enumsResolver,
			sequencesResolver,
			policyResolver,
			indPolicyResolver,
			roleResolver,
			tablesResolver,
			columnsResolver,
			viewsResolver,
			validatedPrev,
			validatedCur,
		);

		writeResult({
			cur,
			sqlStatements,
			journal,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			prefixMode: config.prefix,
		});
	} catch (e) {
		console.error(e);
	}
};

export const prepareAndExportPg = async (config: ExportConfig) => {
	const schemaPath = config.schema;

	try {
		const { prev, cur } = await preparePgMigrationSnapshot(
			[], // no snapshots before
			schemaPath,
			undefined,
		);

		const validatedPrev = pgSchema.parse(prev);
		const validatedCur = pgSchema.parse(cur);

		const squashedPrev = squashPgScheme(validatedPrev);
		const squashedCur = squashPgScheme(validatedCur);

		const { sqlStatements } = await applyPgSnapshotsDiff(
			squashedPrev,
			squashedCur,
			schemasResolver,
			enumsResolver,
			sequencesResolver,
			policyResolver,
			indPolicyResolver,
			roleResolver,
			tablesResolver,
			columnsResolver,
			viewsResolver,
			validatedPrev,
			validatedCur,
		);

		console.log(sqlStatements.join('\n'));
	} catch (e) {
		console.error(e);
	}
};

export const preparePgPush = async (
	cur: PgSchema,
	prev: PgSchema,
) => {
	const validatedPrev = pgSchema.parse(prev);
	const validatedCur = pgSchema.parse(cur);

	const squashedPrev = squashPgScheme(validatedPrev, 'push');
	const squashedCur = squashPgScheme(validatedCur, 'push');

	const { sqlStatements, statements, _meta } = await applyPgSnapshotsDiff(
		squashedPrev,
		squashedCur,
		schemasResolver,
		enumsResolver,
		sequencesResolver,
		policyResolver,
		indPolicyResolver,
		roleResolver,
		tablesResolver,
		columnsResolver,
		viewsResolver,
		validatedPrev,
		validatedCur,
		'push',
	);

	return { sqlStatements, statements, squashedPrev, squashedCur };
};

// Not needed for now
function mysqlSchemaSuggestions(
	curSchema: TypeOf<typeof mysqlSchema>,
	prevSchema: TypeOf<typeof mysqlSchema>,
) {
	const suggestions: string[] = [];
	const usedSuggestions: string[] = [];
	const suggestionTypes = {
		serial: withStyle.errorWarning(
			`We deprecated the use of 'serial' for MySQL starting from version 0.20.0. In MySQL, 'serial' is simply an alias for 'bigint unsigned not null auto_increment unique,' which creates all constraints and indexes for you. This may make the process less explicit for both users and drizzle-kit push commands`,
		),
	};

	for (const table of Object.values(curSchema.tables)) {
		for (const column of Object.values(table.columns)) {
			if (column.type === 'serial') {
				if (!usedSuggestions.includes('serial')) {
					suggestions.push(suggestionTypes['serial']);
				}

				const uniqueForSerial = Object.values(
					prevSchema.tables[table.name].uniqueConstraints,
				).find((it) => it.columns[0] === column.name);

				suggestions.push(
					`\n`
						+ withStyle.suggestion(
							`We are suggesting to change ${
								chalk.blue(
									column.name,
								)
							} column in ${
								chalk.blueBright(
									table.name,
								)
							} table from serial to bigint unsigned\n\n${
								chalk.blueBright(
									`bigint("${column.name}", { mode: "number", unsigned: true }).notNull().autoincrement().unique(${
										uniqueForSerial?.name ? `"${uniqueForSerial?.name}"` : ''
									})`,
								)
							}`,
						),
				);
			}
		}
	}

	return suggestions;
}

// Intersect with prepareAnMigrate
export const prepareMySQLPush = async (
	schemaPath: string | string[],
	snapshot: MySqlSchema,
	casing: CasingType | undefined,
) => {
	try {
		const { prev, cur } = await prepareMySqlDbPushSnapshot(
			snapshot,
			schemaPath,
			casing,
		);

		const validatedPrev = mysqlSchema.parse(prev);
		const validatedCur = mysqlSchema.parse(cur);

		const squashedPrev = squashMysqlScheme(validatedPrev);
		const squashedCur = squashMysqlScheme(validatedCur);

		const { sqlStatements, statements } = await applyMysqlSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			mySqlViewsResolver,
			validatedPrev,
			validatedCur,
			'push',
		);

		return { sqlStatements, statements, validatedCur, validatedPrev };
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
};

export const prepareAndMigrateMysql = async (config: GenerateConfig) => {
	const outFolder = config.out;
	const schemaPath = config.schema;
	const casing = config.casing;

	try {
		// TODO: remove
		assertV1OutFolder(outFolder);

		const { snapshots, journal } = prepareMigrationFolder(outFolder, 'mysql');
		const { prev, cur, custom } = await prepareMySqlMigrationSnapshot(
			snapshots,
			schemaPath,
			casing,
		);

		const validatedPrev = mysqlSchema.parse(prev);
		const validatedCur = mysqlSchema.parse(cur);

		if (config.custom) {
			writeResult({
				cur: custom,
				sqlStatements: [],
				journal,
				outFolder,
				name: config.name,
				breakpoints: config.breakpoints,
				type: 'custom',
				prefixMode: config.prefix,
			});
			return;
		}

		const squashedPrev = squashMysqlScheme(validatedPrev);
		const squashedCur = squashMysqlScheme(validatedCur);

		const { sqlStatements, statements, _meta } = await applyMysqlSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			mySqlViewsResolver,
			validatedPrev,
			validatedCur,
		);

		writeResult({
			cur,
			sqlStatements,
			journal,
			_meta,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			prefixMode: config.prefix,
		});
	} catch (e) {
		console.error(e);
	}
};

// Not needed for now
function singleStoreSchemaSuggestions(
	curSchema: TypeOf<typeof singlestoreSchema>,
	prevSchema: TypeOf<typeof singlestoreSchema>,
) {
	const suggestions: string[] = [];
	const usedSuggestions: string[] = [];
	const suggestionTypes = {
		// TODO: Check if SingleStore has serial type
		serial: withStyle.errorWarning(
			`We deprecated the use of 'serial' for SingleStore starting from version 0.20.0. In SingleStore, 'serial' is simply an alias for 'bigint unsigned not null auto_increment unique,' which creates all constraints and indexes for you. This may make the process less explicit for both users and drizzle-kit push commands`,
		),
	};

	for (const table of Object.values(curSchema.tables)) {
		for (const column of Object.values(table.columns)) {
			if (column.type === 'serial') {
				if (!usedSuggestions.includes('serial')) {
					suggestions.push(suggestionTypes['serial']);
				}

				const uniqueForSerial = Object.values(
					prevSchema.tables[table.name].uniqueConstraints,
				).find((it) => it.columns[0] === column.name);

				suggestions.push(
					`\n`
						+ withStyle.suggestion(
							`We are suggesting to change ${
								chalk.blue(
									column.name,
								)
							} column in ${
								chalk.blueBright(
									table.name,
								)
							} table from serial to bigint unsigned\n\n${
								chalk.blueBright(
									`bigint("${column.name}", { mode: "number", unsigned: true }).notNull().autoincrement().unique(${
										uniqueForSerial?.name ? `"${uniqueForSerial?.name}"` : ''
									})`,
								)
							}`,
						),
				);
			}
		}
	}

	return suggestions;
}

// Intersect with prepareAnMigrate
export const prepareSingleStorePush = async (
	schemaPath: string | string[],
	snapshot: SingleStoreSchema,
	casing: CasingType | undefined,
) => {
	try {
		const { prev, cur } = await prepareSingleStoreDbPushSnapshot(
			snapshot,
			schemaPath,
			casing,
		);

		const validatedPrev = singlestoreSchema.parse(prev);
		const validatedCur = singlestoreSchema.parse(cur);

		const squashedPrev = squashSingleStoreScheme(validatedPrev);
		const squashedCur = squashSingleStoreScheme(validatedCur);

		const { sqlStatements, statements } = await applySingleStoreSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			/* singleStoreViewsResolver, */
			validatedPrev,
			validatedCur,
			'push',
		);

		return { sqlStatements, statements, validatedCur, validatedPrev };
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
};

export const prepareAndMigrateSingleStore = async (config: GenerateConfig) => {
	const outFolder = config.out;
	const schemaPath = config.schema;
	const casing = config.casing;

	try {
		// TODO: remove
		assertV1OutFolder(outFolder);

		const { snapshots, journal } = prepareMigrationFolder(outFolder, 'singlestore');
		const { prev, cur, custom } = await prepareSingleStoreMigrationSnapshot(
			snapshots,
			schemaPath,
			casing,
		);

		const validatedPrev = singlestoreSchema.parse(prev);
		const validatedCur = singlestoreSchema.parse(cur);

		if (config.custom) {
			writeResult({
				cur: custom,
				sqlStatements: [],
				journal,
				outFolder,
				name: config.name,
				breakpoints: config.breakpoints,
				type: 'custom',
				prefixMode: config.prefix,
			});
			return;
		}

		const squashedPrev = squashSingleStoreScheme(validatedPrev);
		const squashedCur = squashSingleStoreScheme(validatedCur);

		const { sqlStatements, _meta } = await applySingleStoreSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			/* singleStoreViewsResolver, */
			validatedPrev,
			validatedCur,
		);

		writeResult({
			cur,
			sqlStatements,
			journal,
			_meta,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			prefixMode: config.prefix,
		});
	} catch (e) {
		console.error(e);
	}
};

export const prepareAndExportSinglestore = async (config: ExportConfig) => {
	const schemaPath = config.schema;

	try {
		const { prev, cur } = await prepareSingleStoreMigrationSnapshot(
			[],
			schemaPath,
			undefined,
		);

		const validatedPrev = singlestoreSchema.parse(prev);
		const validatedCur = singlestoreSchema.parse(cur);

		const squashedPrev = squashSingleStoreScheme(validatedPrev);
		const squashedCur = squashSingleStoreScheme(validatedCur);

		const { sqlStatements, _meta } = await applySingleStoreSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			/* singleStoreViewsResolver, */
			validatedPrev,
			validatedCur,
		);

		console.log(sqlStatements.join('\n'));
	} catch (e) {
		console.error(e);
	}
};

export const prepareAndExportMysql = async (config: ExportConfig) => {
	const schemaPath = config.schema;

	try {
		const { prev, cur, custom } = await prepareMySqlMigrationSnapshot(
			[],
			schemaPath,
			undefined,
		);

		const validatedPrev = mysqlSchema.parse(prev);
		const validatedCur = mysqlSchema.parse(cur);

		const squashedPrev = squashMysqlScheme(validatedPrev);
		const squashedCur = squashMysqlScheme(validatedCur);

		const { sqlStatements, statements, _meta } = await applyMysqlSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			mySqlViewsResolver,
			validatedPrev,
			validatedCur,
		);

		console.log(sqlStatements.join('\n'));
	} catch (e) {
		console.error(e);
	}
};

export const prepareAndMigrateSqlite = async (config: GenerateConfig) => {
	const outFolder = config.out;
	const schemaPath = config.schema;
	const casing = config.casing;

	try {
		assertV1OutFolder(outFolder);

		const { snapshots, journal } = prepareMigrationFolder(outFolder, 'sqlite');
		const { prev, cur, custom } = await prepareSqliteMigrationSnapshot(
			snapshots,
			schemaPath,
			casing,
		);

		const validatedPrev = sqliteSchema.parse(prev);
		const validatedCur = sqliteSchema.parse(cur);

		if (config.custom) {
			writeResult({
				cur: custom,
				sqlStatements: [],
				journal,
				outFolder,
				name: config.name,
				breakpoints: config.breakpoints,
				bundle: config.bundle,
				type: 'custom',
				prefixMode: config.prefix,
			});
			return;
		}

		const squashedPrev = squashSqliteScheme(validatedPrev);
		const squashedCur = squashSqliteScheme(validatedCur);

		const { sqlStatements, _meta } = await applySqliteSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			sqliteViewsResolver,
			validatedPrev,
			validatedCur,
		);

		writeResult({
			cur,
			sqlStatements,
			journal,
			_meta,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			bundle: config.bundle,
			prefixMode: config.prefix,
			driver: config.driver,
		});
	} catch (e) {
		console.error(e);
	}
};

export const prepareAndExportSqlite = async (config: ExportConfig) => {
	const schemaPath = config.schema;

	try {
		const { prev, cur } = await prepareSqliteMigrationSnapshot(
			[],
			schemaPath,
			undefined,
		);

		const validatedPrev = sqliteSchema.parse(prev);
		const validatedCur = sqliteSchema.parse(cur);

		const squashedPrev = squashSqliteScheme(validatedPrev);
		const squashedCur = squashSqliteScheme(validatedCur);

		const { sqlStatements, _meta } = await applySqliteSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			sqliteViewsResolver,
			validatedPrev,
			validatedCur,
		);

		console.log(sqlStatements.join('\n'));
	} catch (e) {
		console.error(e);
	}
};

export const prepareAndMigrateLibSQL = async (config: GenerateConfig) => {
	const outFolder = config.out;
	const schemaPath = config.schema;
	const casing = config.casing;

	try {
		assertV1OutFolder(outFolder);

		const { snapshots, journal } = prepareMigrationFolder(outFolder, 'sqlite');
		const { prev, cur, custom } = await prepareSqliteMigrationSnapshot(
			snapshots,
			schemaPath,
			casing,
		);

		const validatedPrev = sqliteSchema.parse(prev);
		const validatedCur = sqliteSchema.parse(cur);

		if (config.custom) {
			writeResult({
				cur: custom,
				sqlStatements: [],
				journal,
				outFolder,
				name: config.name,
				breakpoints: config.breakpoints,
				bundle: config.bundle,
				type: 'custom',
				prefixMode: config.prefix,
			});
			return;
		}

		const squashedPrev = squashSqliteScheme(validatedPrev);
		const squashedCur = squashSqliteScheme(validatedCur);

		const { sqlStatements, _meta } = await applyLibSQLSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			sqliteViewsResolver,
			validatedPrev,
			validatedCur,
		);

		writeResult({
			cur,
			sqlStatements,
			journal,
			_meta,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			bundle: config.bundle,
			prefixMode: config.prefix,
		});
	} catch (e) {
		console.error(e);
	}
};

export const prepareAndExportLibSQL = async (config: ExportConfig) => {
	const schemaPath = config.schema;

	try {
		const { prev, cur, custom } = await prepareSqliteMigrationSnapshot(
			[],
			schemaPath,
			undefined,
		);

		const validatedPrev = sqliteSchema.parse(prev);
		const validatedCur = sqliteSchema.parse(cur);

		const squashedPrev = squashSqliteScheme(validatedPrev);
		const squashedCur = squashSqliteScheme(validatedCur);

		const { sqlStatements, _meta } = await applyLibSQLSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			sqliteViewsResolver,
			validatedPrev,
			validatedCur,
		);

		console.log(sqlStatements.join('\n'));
	} catch (e) {
		console.error(e);
	}
};

export const prepareSQLitePush = async (
	schemaPath: string | string[],
	snapshot: SQLiteSchema,
	casing: CasingType | undefined,
) => {
	const { prev, cur } = await prepareSQLiteDbPushSnapshot(snapshot, schemaPath, casing);

	const validatedPrev = sqliteSchema.parse(prev);
	const validatedCur = sqliteSchema.parse(cur);

	const squashedPrev = squashSqliteScheme(validatedPrev, 'push');
	const squashedCur = squashSqliteScheme(validatedCur, 'push');

	const { sqlStatements, statements, _meta } = await applySqliteSnapshotsDiff(
		squashedPrev,
		squashedCur,
		tablesResolver,
		columnsResolver,
		sqliteViewsResolver,
		validatedPrev,
		validatedCur,
		'push',
	);

	return {
		sqlStatements,
		statements,
		squashedPrev,
		squashedCur,
		meta: _meta,
	};
};

export const prepareLibSQLPush = async (
	schemaPath: string | string[],
	snapshot: SQLiteSchema,
	casing: CasingType | undefined,
) => {
	const { prev, cur } = await prepareSQLiteDbPushSnapshot(snapshot, schemaPath, casing);

	const validatedPrev = sqliteSchema.parse(prev);
	const validatedCur = sqliteSchema.parse(cur);

	const squashedPrev = squashSqliteScheme(validatedPrev, 'push');
	const squashedCur = squashSqliteScheme(validatedCur, 'push');

	const { sqlStatements, statements, _meta } = await applyLibSQLSnapshotsDiff(
		squashedPrev,
		squashedCur,
		tablesResolver,
		columnsResolver,
		sqliteViewsResolver,
		validatedPrev,
		validatedCur,
		'push',
	);

	return {
		sqlStatements,
		statements,
		squashedPrev,
		squashedCur,
		meta: _meta,
	};
};

const freeeeeeze = (obj: any) => {
	Object.freeze(obj);
	for (let key in obj) {
		if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
			freeeeeeze(obj[key]);
		}
	}
};

export const promptColumnsConflicts = async <T extends Named>(
	tableName: string,
	newColumns: T[],
	missingColumns: T[],
) => {
	if (newColumns.length === 0 || missingColumns.length === 0) {
		return { created: newColumns, renamed: [], deleted: missingColumns };
	}
	const result: { created: T[]; renamed: { from: T; to: T }[]; deleted: T[] } = {
		created: [],
		renamed: [],
		deleted: [],
	};

	let index = 0;
	let leftMissing = [...missingColumns];

	do {
		const created = newColumns[index];

		const renames: RenamePropmtItem<T>[] = leftMissing.map((it) => {
			return { from: it, to: created };
		});

		const promptData: (RenamePropmtItem<T> | T)[] = [created, ...renames];

		const { status, data } = await render(
			new ResolveColumnSelect<T>(tableName, created, promptData),
		);
		if (status === 'aborted') {
			console.error('ERROR');
			process.exit(1);
		}

		if (isRenamePromptItem(data)) {
			console.log(
				`${chalk.yellow('~')} ${data.from.name} › ${data.to.name} ${
					chalk.gray(
						'column will be renamed',
					)
				}`,
			);
			result.renamed.push(data);
			// this will make [item1, undefined, item2]
			delete leftMissing[leftMissing.indexOf(data.from)];
			// this will make [item1, item2]
			leftMissing = leftMissing.filter(Boolean);
		} else {
			console.log(
				`${chalk.green('+')} ${data.name} ${
					chalk.gray(
						'column will be created',
					)
				}`,
			);
			result.created.push(created);
		}
		index += 1;
	} while (index < newColumns.length);
	console.log(
		chalk.gray(`--- all columns conflicts in ${tableName} table resolved ---\n`),
	);

	result.deleted.push(...leftMissing);
	return result;
};

export const promptNamedConflict = async <T extends Named>(
	newItems: T[],
	missingItems: T[],
	entity: 'role' | 'policy',
): Promise<{
	created: T[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}> => {
	if (missingItems.length === 0 || newItems.length === 0) {
		return {
			created: newItems,
			renamed: [],
			deleted: missingItems,
		};
	}

	const result: {
		created: T[];
		renamed: { from: T; to: T }[];
		deleted: T[];
	} = { created: [], renamed: [], deleted: [] };
	let index = 0;
	let leftMissing = [...missingItems];
	do {
		const created = newItems[index];
		const renames: RenamePropmtItem<T>[] = leftMissing.map((it) => {
			return { from: it, to: created };
		});

		const promptData: (RenamePropmtItem<T> | T)[] = [created, ...renames];

		const { status, data } = await render(
			new ResolveSelectNamed<T>(created, promptData, entity),
		);
		if (status === 'aborted') {
			console.error('ERROR');
			process.exit(1);
		}

		if (isRenamePromptItem(data)) {
			console.log(
				`${chalk.yellow('~')} ${data.from.name} › ${data.to.name} ${
					chalk.gray(
						`${entity} will be renamed/moved`,
					)
				}`,
			);

			if (data.from.name !== data.to.name) {
				result.renamed.push(data);
			}

			delete leftMissing[leftMissing.indexOf(data.from)];
			leftMissing = leftMissing.filter(Boolean);
		} else {
			console.log(
				`${chalk.green('+')} ${data.name} ${
					chalk.gray(
						`${entity} will be created`,
					)
				}`,
			);
			result.created.push(created);
		}
		index += 1;
	} while (index < newItems.length);
	console.log(chalk.gray(`--- all ${entity} conflicts resolved ---\n`));
	result.deleted.push(...leftMissing);
	return result;
};

export const promptNamedWithSchemasConflict = async <T extends NamedWithSchema>(
	newItems: T[],
	missingItems: T[],
	entity: 'table' | 'enum' | 'sequence' | 'view',
): Promise<{
	created: T[];
	renamed: { from: T; to: T }[];
	moved: { name: string; schemaFrom: string; schemaTo: string }[];
	deleted: T[];
}> => {
	if (missingItems.length === 0 || newItems.length === 0) {
		return {
			created: newItems,
			renamed: [],
			moved: [],
			deleted: missingItems,
		};
	}

	const result: {
		created: T[];
		renamed: { from: T; to: T }[];
		moved: { name: string; schemaFrom: string; schemaTo: string }[];
		deleted: T[];
	} = { created: [], renamed: [], moved: [], deleted: [] };
	let index = 0;
	let leftMissing = [...missingItems];
	do {
		const created = newItems[index];
		const renames: RenamePropmtItem<T>[] = leftMissing.map((it) => {
			return { from: it, to: created };
		});

		const promptData: (RenamePropmtItem<T> | T)[] = [created, ...renames];

		const { status, data } = await render(
			new ResolveSelect<T>(created, promptData, entity),
		);
		if (status === 'aborted') {
			console.error('ERROR');
			process.exit(1);
		}

		if (isRenamePromptItem(data)) {
			const schemaFromPrefix = !data.from.schema || data.from.schema === 'public'
				? ''
				: `${data.from.schema}.`;
			const schemaToPrefix = !data.to.schema || data.to.schema === 'public'
				? ''
				: `${data.to.schema}.`;

			console.log(
				`${chalk.yellow('~')} ${schemaFromPrefix}${data.from.name} › ${schemaToPrefix}${data.to.name} ${
					chalk.gray(
						`${entity} will be renamed/moved`,
					)
				}`,
			);

			if (data.from.name !== data.to.name) {
				result.renamed.push(data);
			}

			if (data.from.schema !== data.to.schema) {
				result.moved.push({
					name: data.from.name,
					schemaFrom: data.from.schema || 'public',
					schemaTo: data.to.schema || 'public',
				});
			}

			delete leftMissing[leftMissing.indexOf(data.from)];
			leftMissing = leftMissing.filter(Boolean);
		} else {
			console.log(
				`${chalk.green('+')} ${data.name} ${
					chalk.gray(
						`${entity} will be created`,
					)
				}`,
			);
			result.created.push(created);
		}
		index += 1;
	} while (index < newItems.length);
	console.log(chalk.gray(`--- all ${entity} conflicts resolved ---\n`));
	result.deleted.push(...leftMissing);
	return result;
};

export const promptSchemasConflict = async <T extends Named>(
	newSchemas: T[],
	missingSchemas: T[],
): Promise<{ created: T[]; renamed: { from: T; to: T }[]; deleted: T[] }> => {
	if (missingSchemas.length === 0 || newSchemas.length === 0) {
		return { created: newSchemas, renamed: [], deleted: missingSchemas };
	}

	const result: { created: T[]; renamed: { from: T; to: T }[]; deleted: T[] } = {
		created: [],
		renamed: [],
		deleted: [],
	};
	let index = 0;
	let leftMissing = [...missingSchemas];
	do {
		const created = newSchemas[index];
		const renames: RenamePropmtItem<T>[] = leftMissing.map((it) => {
			return { from: it, to: created };
		});

		const promptData: (RenamePropmtItem<T> | T)[] = [created, ...renames];

		const { status, data } = await render(
			new ResolveSchemasSelect<T>(created, promptData),
		);
		if (status === 'aborted') {
			console.error('ERROR');
			process.exit(1);
		}

		if (isRenamePromptItem(data)) {
			console.log(
				`${chalk.yellow('~')} ${data.from.name} › ${data.to.name} ${
					chalk.gray(
						'schema will be renamed',
					)
				}`,
			);
			result.renamed.push(data);
			delete leftMissing[leftMissing.indexOf(data.from)];
			leftMissing = leftMissing.filter(Boolean);
		} else {
			console.log(
				`${chalk.green('+')} ${data.name} ${
					chalk.gray(
						'schema will be created',
					)
				}`,
			);
			result.created.push(created);
		}
		index += 1;
	} while (index < newSchemas.length);
	console.log(chalk.gray('--- all schemas conflicts resolved ---\n'));
	result.deleted.push(...leftMissing);
	return result;
};

export const BREAKPOINT = '--> statement-breakpoint\n';

export const writeResult = ({
	cur,
	sqlStatements,
	journal,
	_meta = {
		columns: {},
		schemas: {},
		tables: {},
	},
	outFolder,
	breakpoints,
	name,
	bundle = false,
	type = 'none',
	prefixMode,
	driver,
}: {
	cur: CommonSchema;
	sqlStatements: string[];
	journal: Journal;
	_meta?: any;
	outFolder: string;
	breakpoints: boolean;
	prefixMode: Prefix;
	name?: string;
	bundle?: boolean;
	type?: 'introspect' | 'custom' | 'none';
	driver?: Driver;
}) => {
	if (type === 'none') {
		console.log(schema(cur));

		if (sqlStatements.length === 0) {
			console.log('No schema changes, nothing to migrate 😴');
			return;
		}
	}

	// append entry to _migrations.json
	// append entry to _journal.json->entries
	// dialect in _journal.json
	// append sql file to out folder
	// append snapshot file to meta folder
	const lastEntryInJournal = journal.entries[journal.entries.length - 1];
	const idx = typeof lastEntryInJournal === 'undefined' ? 0 : lastEntryInJournal.idx + 1;

	const { prefix, tag } = prepareMigrationMetadata(idx, prefixMode, name);

	const toSave = JSON.parse(JSON.stringify(cur));
	toSave['_meta'] = _meta;

	// todo: save results to a new migration folder
	const metaFolderPath = join(outFolder, 'meta');
	const metaJournal = join(metaFolderPath, '_journal.json');

	fs.writeFileSync(
		join(metaFolderPath, `${prefix}_snapshot.json`),
		JSON.stringify(toSave, null, 2),
	);

	const sqlDelimiter = breakpoints ? BREAKPOINT : '\n';
	let sql = sqlStatements.join(sqlDelimiter);

	if (type === 'introspect') {
		sql =
			`-- Current sql file was generated after introspecting the database\n-- If you want to run this migration please uncomment this code before executing migrations\n/*\n${sql}\n*/`;
	}

	if (type === 'custom') {
		console.log('Prepared empty file for your custom SQL migration!');
		sql = '-- Custom SQL migration file, put your code below! --';
	}

	journal.entries.push({
		idx,
		version: cur.version,
		when: +new Date(),
		tag,
		breakpoints: breakpoints,
	});

	fs.writeFileSync(metaJournal, JSON.stringify(journal, null, 2));

	fs.writeFileSync(`${outFolder}/${tag}.sql`, sql);

	// js file with .sql imports for React Native / Expo and Durable Sqlite Objects
	if (bundle) {
		const js = embeddedMigrations(journal, driver);
		fs.writeFileSync(`${outFolder}/migrations.js`, js);
	}

	render(
		`[${
			chalk.green(
				'✓',
			)
		}] Your SQL migration file ➜ ${
			chalk.bold.underline.blue(
				path.join(`${outFolder}/${tag}.sql`),
			)
		} 🚀`,
	);
};

export const embeddedMigrations = (journal: Journal, driver?: Driver) => {
	let content = driver === 'expo'
		? '// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo\n\n'
		: '';

	content += "import journal from './meta/_journal.json';\n";
	journal.entries.forEach((entry) => {
		content += `import m${entry.idx.toString().padStart(4, '0')} from './${entry.tag}.sql';\n`;
	});

	content += `
  export default {
    journal,
    migrations: {
      ${
		journal.entries
			.map((it) => `m${it.idx.toString().padStart(4, '0')}`)
			.join(',\n')
	}
    }
  }
  `;
	return content;
};

export const prepareSnapshotFolderName = () => {
	const now = new Date();
	return `${now.getFullYear()}${two(now.getUTCMonth() + 1)}${
		two(
			now.getUTCDate(),
		)
	}${two(now.getUTCHours())}${two(now.getUTCMinutes())}${
		two(
			now.getUTCSeconds(),
		)
	}`;
};

const two = (input: number): string => {
	return input.toString().padStart(2, '0');
};
