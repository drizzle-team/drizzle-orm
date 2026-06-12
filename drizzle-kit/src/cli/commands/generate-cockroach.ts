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
			dialect: 'cockroach',
			generateDownMigrations: config.generateDownMigrations,
			type: 'custom',
			renames: [],
			snapshots,
		});
	}

	const schemaRenames: { from: Schema; to: Schema }[] = [];
	const enumRenames: { from: Enum; to: Enum }[] = [];
	const seqRenames: { from: Sequence; to: Sequence }[] = [];
	const policyRenames: { from: Policy; to: Policy }[] = [];
	const tableRenames: { from: CockroachEntities['tables']; to: CockroachEntities['tables'] }[] = [];
	const columnRenames: { from: Column; to: Column }[] = [];
	const viewRenames: { from: View; to: View }[] = [];
	const indexRenames: { from: Index; to: Index }[] = [];
	const checkRenames: { from: CheckConstraint; to: CheckConstraint }[] = [];
	const pkRenames: { from: PrimaryKey; to: PrimaryKey }[] = [];
	const fkRenames: { from: ForeignKey; to: ForeignKey }[] = [];

	const { sqlStatements, renames, groupedStatements, statements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		withCapture(resolver<Schema>('schema', config.hints), schemaRenames),
		withCapture(resolver<Enum>('enum', config.hints), enumRenames),
		withCapture(resolver<Sequence>('sequence', config.hints), seqRenames),
		withCapture(resolver<Policy>('policy', config.hints), policyRenames),
		withCapture(resolver<CockroachEntities['tables']>('table', config.hints), tableRenames),
		withCapture(resolver<Column>('column', config.hints), columnRenames),
		withCapture(resolver<View>('view', config.hints), viewRenames),
		withCapture(resolver<Index>('index', config.hints), indexRenames),
		withCapture(resolver<CheckConstraint>('check', config.hints), checkRenames),
		withCapture(resolver<PrimaryKey>('primary_key', config.hints), pkRenames),
		withCapture(resolver<ForeignKey>('foreign key', config.hints), fkRenames),
		'default',
	);

	if (config.hints.hasMissingHints()) {
		return config.hints.toResponse();
	}

	const downDiff = config.generateDownMigrations
		? await ddlDiff(
			ddlCur,
			ddlPrev,
			makeInverseResolver(schemaRenames),
			makeInverseResolver(enumRenames),
			makeInverseResolver(seqRenames),
			makeInverseResolver(policyRenames),
			makeInverseResolver(tableRenames),
			makeInverseResolver(columnRenames),
			makeInverseResolver(viewRenames),
			makeInverseResolver(indexRenames),
			makeInverseResolver(checkRenames),
			makeInverseResolver(pkRenames),
			makeInverseResolver(fkRenames),
			'default',
		)
		: undefined;
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
