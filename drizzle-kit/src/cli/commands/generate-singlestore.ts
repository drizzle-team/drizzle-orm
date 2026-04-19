import type { Column, Table, View } from '../../dialects/mysql/ddl';
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
import { makeInverseResolver, withCapture } from './generate-down-helpers';
import type { ExportConfig, GenerateConfig } from './utils';

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

	const tableRenames: { from: Table; to: Table }[] = [];
	const columnRenames: { from: Column; to: Column }[] = [];
	const viewRenames: { from: View; to: View }[] = [];

	const { sqlStatements, renames, groupedStatements, statements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		withCapture(resolver<Table>('table', config.hints), tableRenames),
		withCapture(resolver<Column>('column', config.hints), columnRenames),
		withCapture(resolver<View>('view', config.hints), viewRenames),
		'default',
	);

	if (config.hints.hasMissingHints()) {
		return config.hints.toResponse();
	}

	const downSqlStatements = config.generateDownMigrations
		? (await ddlDiff(
			ddlCur,
			ddlPrev,
			makeInverseResolver(tableRenames),
			makeInverseResolver(columnRenames),
			makeInverseResolver(viewRenames),
			'default',
		)).sqlStatements
		: undefined;

	if (!config.explain) {
		return writeResult({
			snapshot,
			sqlStatements,
			downSqlStatements,
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
