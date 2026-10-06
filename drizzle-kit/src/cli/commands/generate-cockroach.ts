import type {
	CheckConstraint,
	CockroachDDL,
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
import { captureRenames, cloneDDL, type ResolverFor } from './generate-down-helpers';
import type { ExportConfig, GenerateConfig } from './utils';

export const ddlDiffWithDown = async (ddlPrev: CockroachDDL, ddlCur: CockroachDDL, resolverFor: ResolverFor) => {
	const { forward, inverse } = captureRenames(resolverFor);
	const downFrom = cloneDDL(ddlCur, createDDL);
	const downTo = cloneDDL(ddlPrev, createDDL);
	const result = await ddlDiff(
		ddlPrev,
		ddlCur,
		forward<Schema>('schema'),
		forward<Enum>('enum'),
		forward<Sequence>('sequence'),
		forward<Policy>('policy'),
		forward<CockroachEntities['tables']>('table'),
		forward<Column>('column'),
		forward<View>('view'),
		forward<Index>('index'),
		forward<CheckConstraint>('check'),
		forward<PrimaryKey>('primary_key'),
		forward<ForeignKey>('foreign key'),
		'default',
	);
	const down = () =>
		ddlDiff(
			downFrom,
			downTo,
			inverse<Schema>('schema'),
			inverse<Enum>('enum'),
			inverse<Sequence>('sequence'),
			inverse<Policy>('policy'),
			inverse<CockroachEntities['tables']>('table'),
			inverse<Column>('column'),
			inverse<View>('view'),
			inverse<Index>('index'),
			inverse<CheckConstraint>('check'),
			inverse<PrimaryKey>('primary_key'),
			inverse<ForeignKey>('foreign key'),
			'default',
		);
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
			dialect: 'cockroach',
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
			snapshot: snapshot,
			sqlStatements,
			downSqlStatements,
			downStatements: downDiff?.groupedStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'cockroach',
			generateDownMigrations: config.generateDownMigrations,
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
