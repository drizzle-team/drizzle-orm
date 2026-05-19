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
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/postgres/drizzle';
import { prepareSnapshot } from '../../dialects/postgres/serializer';
import { prepareOutFolder } from '../../utils/utils-node';
import { isJsonMode } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { explain, explainJsonOutput, humanLog, postgresSchemaError, postgresSchemaWarning } from '../views';
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
		return writeResult({
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
		return config.hints.toResponse();
	}

	if (!config.explain) {
		return writeResult({
			snapshot: snapshot,
			sqlStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'postgresql',
			renames,
			snapshots,
		});
	}

	if (json) {
		if (sqlStatements.length === 0) {
			return { status: 'no_changes' as const, dialect: 'postgresql' };
		}
		return explainJsonOutput('postgresql', statements, []);
	}

	const explainMessage = explain('postgres', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}

	return { status: 'ok' as const, dialect: 'postgresql' };
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
		throw new CommandOutputCliError('generate', errors.map((it) => postgresSchemaError(it)).join('\n'), {
			stage: 'schema',
			dialect: 'postgresql',
		});
	}

	const { ddl, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		throw new CommandOutputCliError('generate', errors2.map((it) => postgresSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'postgresql',
		});
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	console.log(sqlStatements.join('\n'));
};
