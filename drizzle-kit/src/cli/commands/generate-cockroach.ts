import type {
	CheckConstraint,
	CockroachEntities,
	Column,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PrimaryKey,
	Schema,
	Sequence,
	View,
} from '../../dialects/cockroach/ddl';
import { createDDL, interimToDDL } from '../../dialects/cockroach/ddl';
import { ddlDiff, ddlDiffDry } from '../../dialects/cockroach/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/cockroach/drizzle';
import { prepareSnapshot } from '../../dialects/cockroach/serializer';
import { prepareOutFolder } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { cockroachSchemaError, cockroachSchemaWarning, explain, explainJsonOutput, humanLog } from '../views';
import { writeResult } from './generate-common';
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
			dialect: 'cockroach',
			type: 'custom',
			renames: [],
			snapshots,
		});
	}

	const { sqlStatements, renames, groupedStatements, statements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema', config.hints),
		resolver<Enum>('enum', config.hints),
		resolver<Sequence>('sequence', config.hints),
		resolver<Policy>('policy', config.hints),
		resolver<CockroachEntities['tables']>('table', config.hints),
		resolver<Column>('column', config.hints),
		resolver<View>('view', config.hints),
		resolver<Index>('index', config.hints),
		resolver<CheckConstraint>('check', config.hints),
		resolver<PrimaryKey>('primary_key', config.hints),
		resolver<ForeignKey>('foreign key', config.hints),
		'default',
	);

	if (config.hints.hasMissingHints()) {
		return config.hints.toResponse();
	}

	if (!config.explain) {
		return writeResult({
			snapshot: snapshot,
			sqlStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'cockroach',
			renames,
			snapshots,
		});
	}

	if (json) {
		if (sqlStatements.length === 0) {
			return { status: 'no_changes' as const, dialect: 'cockroach' };
		}
		return explainJsonOutput('cockroach', statements, []);
	}

	const explainMessage = explain('cockroach', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}

	return { status: 'ok' as const, dialect: 'cockroach' };
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);

	// TODO: do we wanna respect entity filter while exporting to sql?
	// cc: @AleksandrSherman
	const { schema, errors, warnings } = fromDrizzleSchema(res, () => true);

	if (errors.length > 0) {
		throw new CommandOutputCliError('export', errors.map((it) => cockroachSchemaError(it)).join('\n'), {
			stage: 'schema',
			dialect: 'cockroach',
		});
	}

	const { ddl, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		throw new CommandOutputCliError('export', errors2.map((it) => cockroachSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'cockroach',
		});
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	return {
		statements: sqlStatements,
		warnings: warnings.map((it) => cockroachSchemaWarning(it)),
	};
};
