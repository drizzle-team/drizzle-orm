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
import type { JsonStatement } from '../../dialects/postgres/statements';
import { CommandOutputCliError } from '../errors';
import { isJsonMode } from '../mode';
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
			type: 'custom',
			renames: [],
			snapshots,
		});
		return;
	}

	let sqlStatements: string[] = [];
	let renames: string[] = [];
	let groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[] = [];
	let jsonStatements: JsonStatement[] = [];

	const diffResult = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema', 'public', 'generate', config.hints),
		resolver<Enum>('enum', 'public', 'generate', config.hints),
		resolver<Sequence>('sequence', 'public', 'generate', config.hints),
		resolver<Policy>('policy', 'public', 'generate', config.hints),
		resolver<Role>('role', 'public', 'generate', config.hints),
		resolver<Privilege>('privilege', 'public', 'generate', config.hints),
		resolver<PostgresEntities['tables']>('table', 'public', 'generate', config.hints),
		resolver<Column>('column', 'public', 'generate', config.hints),
		resolver<View>('view', 'public', 'generate', config.hints),
		resolver<UniqueConstraint>('unique', 'public', 'generate', config.hints),
		resolver<Index>('index', 'public', 'generate', config.hints),
		resolver<CheckConstraint>('check', 'public', 'generate', config.hints),
		resolver<PrimaryKey>('primary key', 'public', 'generate', config.hints),
		resolver<ForeignKey>('foreign key', 'public', 'generate', config.hints),
		'default',
	);

	sqlStatements = diffResult.sqlStatements;
	renames = diffResult.renames;
	groupedStatements = diffResult.groupedStatements;
	jsonStatements = diffResult.statements;

	if (isJsonMode() && config.hints.hasUnresolved()) {
		config.hints.emitAndExit();
	}

	if (!config.explain) {
		writeResult({
			snapshot: snapshot,
			sqlStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			renames,
			snapshots,
		});
		return;
	}

	if (isJsonMode()) {
		const explainOutput = explainJsonOutput('postgres', jsonStatements, []);
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
		humanLog(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		throw new CommandOutputCliError('export', errors.map((it) => postgresSchemaError(it)).join('\n'), {
			stage: 'schema',
			dialect: 'postgresql',
		});
	}

	const { ddl, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		throw new CommandOutputCliError('export', errors2.map((it) => postgresSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'postgresql',
		});
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	printJsonOutput({ sqlStatements });
	humanLog(sqlStatements.join('\n'));
};
