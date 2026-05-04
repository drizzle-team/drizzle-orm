import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/postgres/drizzle';
import { prepareOutFolder } from 'src/utils/utils-node';
import type {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PostgresEntities,
	PrimaryKey,
	Privilege,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from '../../dialects/postgres/ddl';
import { createDDL, interimToDDL } from '../../dialects/postgres/ddl';
import { ddlDiff, ddlDiffDry } from '../../dialects/postgres/diff';
import { prepareSnapshot } from '../../dialects/postgres/serializer';
import { isJsonMode } from '../context';
import { resolver } from '../prompts';
import {
	explain,
	explainJsonOutput,
	humanLog,
	postgresSchemaError,
	postgresSchemaWarning,
	printJsonOutput,
} from '../views';
import type { CheckHandlerResult } from './check';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (
	config: GenerateConfig,
	checkResult?: CheckHandlerResult,
) => {
	const { out: outFolder, filenames, casing } = config;
	const json = isJsonMode();

	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(
		snapshots,
		filenames,
		casing,
		checkResult,
	);

	if (config.custom) {
		writeResult({
			snapshot: custom,
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'postgresql',
			type: 'custom',
			renames: [],
			snapshots,
		});
		return;
	}

	const { sqlStatements, renames, groupedStatements, statements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema', 'public', config.hints),
		resolver<Enum>('enum', 'public', config.hints),
		resolver<Sequence>('sequence', 'public', config.hints),
		resolver<Policy>('policy', 'public', config.hints),
		resolver<Role>('role', 'public', config.hints),
		resolver<Privilege>('privilege', 'public', config.hints),
		resolver<PostgresEntities['tables']>('table', 'public', config.hints),
		resolver<Column>('column', 'public', config.hints),
		resolver<View>('view', 'public', config.hints),
		resolver<UniqueConstraint>('unique', 'public', config.hints),
		resolver<Index>('index', 'public', config.hints),
		resolver<CheckConstraint>('check', 'public', config.hints),
		resolver<PrimaryKey>('primary key', 'public', config.hints),
		resolver<ForeignKey>('foreign key', 'public', config.hints),
		'default',
	);

	if (json && config.hints.hasMissingHints()) {
		config.hints.emitAndExit();
	}

	if (!config.explain) {
		writeResult({
			snapshot: snapshot,
			sqlStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'postgresql',
			renames,
			snapshots,
		});
		return;
	}

	if (json) {
		if (sqlStatements.length === 0) {
			printJsonOutput({ status: 'no_changes', dialect: 'postgresql' });
			return;
		}
		const explainOutput = explainJsonOutput('postgresql', statements, []);
		printJsonOutput(explainOutput);
		return;
	}

	const explainMessage = explain('postgres', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);
	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema, errors, warnings } = fromDrizzleSchema(
		res,
		config.casing,
		() => true,
	);
	if (warnings.length > 0) {
		console.log(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		console.log(errors.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { ddl, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		console.log(errors2.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	console.log(sqlStatements.join('\n'));
};
