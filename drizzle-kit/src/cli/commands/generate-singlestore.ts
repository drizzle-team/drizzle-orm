import type { Column, MysqlDDL, Table, View } from '../../dialects/mysql/ddl';
import { createDDL, interimToDDL } from '../../dialects/mysql/ddl';
import { ddlDiff, ddlDiffDry } from '../../dialects/singlestore/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/singlestore/drizzle';
import { prepareSnapshot } from '../../dialects/singlestore/serializer';
import { prepareOutFolder } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { explain, explainJsonOutput, humanLog, mysqlSchemaError } from '../views';
import { writeResult } from './generate-common';
import { captureRenames, cloneDDL, type ResolverFor } from './generate-down-helpers';
import type { ExportConfig, GenerateConfig } from './utils';

export const ddlDiffWithDown = async (ddlPrev: MysqlDDL, ddlCur: MysqlDDL, resolverFor: ResolverFor) => {
	const { forward, inverse } = captureRenames(resolverFor);
	const downFrom = cloneDDL(ddlCur, createDDL);
	const downTo = cloneDDL(ddlPrev, createDDL);
	const result = await ddlDiff(
		ddlPrev,
		ddlCur,
		forward<Table>('table'),
		forward<Column>('column'),
		forward<View>('view'),
		'default',
	);
	const down = () =>
		ddlDiff(downFrom, downTo, inverse<Table>('table'), inverse<Column>('column'), inverse<View>('view'), 'default');
	return { ...result, down };
};

export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, filenames } = config;
	const json = outputFormat() === 'json';
	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(snapshots, filenames);

	if (config.custom) {
		return writeResult({
			snapshot: custom,
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'singlestore',
			generateDownMigrations: config.generateDownMigrations,
			type: 'custom',
			renames: [],
			snapshots,
		});
	}

	const { sqlStatements, renames, groupedStatements, statements, down } = await ddlDiffWithDown(
		ddlPrev,
		ddlCur,
		(kind) => resolver(kind, config.hints),
	);

	if (config.hints.hasMissingHints()) {
		return config.hints.toResponse();
	}

	const downDiff = config.generateDownMigrations ? await down() : undefined;
	const downSqlStatements = downDiff?.sqlStatements;

	if (!config.explain) {
		return writeResult({
			snapshot,
			sqlStatements,
			downSqlStatements,
			downStatements: downDiff?.groupedStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'singlestore',
			generateDownMigrations: config.generateDownMigrations,
			renames,
			snapshots,
		});
	}

	if (json) {
		if (sqlStatements.length === 0) {
			return { status: 'no_changes' as const, dialect: 'singlestore' };
		}
		return explainJsonOutput('singlestore', statements, []);
	}

	const explainMessage = explain('singlestore', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}

	return { status: 'ok' as const, dialect: 'singlestore' };
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);
	const schema = fromDrizzleSchema(res.tables);
	const { ddl, errors } = interimToDDL(schema);

	if (errors.length > 0) {
		throw new CommandOutputCliError('export', errors.map((it) => mysqlSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'singlestore',
		});
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl);
	return { statements: sqlStatements, warnings: [] };
};
