import { type Column, createDDL, interimToDDL, type SQLiteDDL, type SqliteEntities } from '../../dialects/sqlite/ddl';
import { ddlDiff, ddlDiffDry } from '../../dialects/sqlite/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/sqlite/drizzle';
import type { SchemaSource } from '../../dialects/sqlite/drizzle';
import { prepareSqliteSnapshot } from '../../dialects/sqlite/serializer';
import { prepareOutFolder } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { explain, explainJsonOutput, humanLog, sqliteSchemaError, warning } from '../views';
import type { CheckHandlerResult } from './check';
import { writeResult } from './generate-common';
import { captureRenames, cloneDDL, type ResolverFor } from './generate-down-helpers';
import type { ExportConfig, GenerateConfig } from './utils';

export const ddlDiffWithDown = async (ddlPrev: SQLiteDDL, ddlCur: SQLiteDDL, resolverFor: ResolverFor) => {
	const { forward, inverse } = captureRenames(resolverFor);
	const downFrom = cloneDDL(ddlCur, createDDL);
	const downTo = cloneDDL(ddlPrev, createDDL);
	const result = await ddlDiff(
		ddlPrev,
		ddlCur,
		forward<SqliteEntities['tables']>('table'),
		forward<Column>('column'),
		'default',
	);
	const down = () =>
		ddlDiff(downFrom, downTo, inverse<SqliteEntities['tables']>('table'), inverse<Column>('column'), 'default');
	return { ...result, down };
};

export const handle = async (
	config: GenerateConfig<SchemaSource>,
	checkResult?: CheckHandlerResult,
) => {
	const dialect = config.dialect === 'turso' ? 'turso' : 'sqlite';
	const json = outputFormat() === 'json';
	const { out: outFolder } = config;
	const { snapshots } = prepareOutFolder(outFolder);
	const prepared = await config.schemaSource.load();
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSqliteSnapshot(
		snapshots,
		prepared,
		checkResult,
	);
	if (config.custom) {
		return writeResult({
			snapshot: custom,
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect,
			generateDownMigrations: config.generateDownMigrations,
			bundle: config.bundle,
			type: 'custom',
			renames: [],
			snapshots,
		});
	}

	const { sqlStatements, warnings, renames, groupedStatements, statements, down } = await ddlDiffWithDown(
		ddlPrev,
		ddlCur,
		(kind) => resolver(kind, config.hints),
	);

	if (config.hints.hasMissingHints()) {
		return config.hints.toResponse();
	}

	const downDiff = config.generateDownMigrations ? await down() : undefined;
	const downSqlStatements = downDiff?.sqlStatements;

	if (!json) {
		for (const w of warnings) {
			warning(w);
		}
	}

	if (!config.explain) {
		return writeResult({
			snapshot: snapshot,
			sqlStatements,
			downSqlStatements,
			downStatements: downDiff?.groupedStatements,
			renames,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect,
			generateDownMigrations: config.generateDownMigrations,
			bundle: config.bundle,
			driver: config.driver,
			snapshots,
		});
	}

	if (json) {
		if (sqlStatements.length === 0) {
			return { status: 'no_changes' as const, dialect };
		}
		return explainJsonOutput(dialect, statements, []);
	}

	const explainMessage = explain('sqlite', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}

	return { status: 'ok' as const, dialect };
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);
	const schema = fromDrizzleSchema(res.tables, res.views);
	const { ddl, errors } = interimToDDL(schema);

	if (errors.length > 0) {
		throw new CommandOutputCliError('export', errors.map((it) => sqliteSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'sqlite',
		});
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	return { statements: sqlStatements, warnings: [] };
};
