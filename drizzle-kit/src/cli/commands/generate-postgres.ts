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
import type { SchemaSource } from '../../dialects/postgres/drizzle';
import { prepareSnapshot } from '../../dialects/postgres/serializer';
import { prepareOutFolder } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { explain, explainJsonOutput, humanLog, postgresSchemaError, postgresSchemaWarning } from '../views';
import type { CheckHandlerResult } from './check';
import { writeResult } from './generate-common';
import { makeInverseResolver, withCapture } from './generate-down-helpers';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (
	config: GenerateConfig<SchemaSource>,
	checkResult?: CheckHandlerResult,
) => {
	const { out: outFolder } = config;
	const json = outputFormat() === 'json';

	const { snapshots } = prepareOutFolder(outFolder);
	const prepared = await config.schemaSource.load();
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(
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
			dialect: 'postgresql',
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
	const roleRenames: { from: Role; to: Role }[] = [];
	const privilegeRenames: { from: Privilege; to: Privilege }[] = [];
	const tableRenames: { from: PostgresEntities['tables']; to: PostgresEntities['tables'] }[] = [];
	const columnRenames: { from: Column; to: Column }[] = [];
	const viewRenames: { from: View; to: View }[] = [];
	const uniqueRenames: { from: UniqueConstraint; to: UniqueConstraint }[] = [];
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
		withCapture(resolver<Role>('role', config.hints), roleRenames),
		withCapture(resolver<Privilege>('privilege', config.hints), privilegeRenames),
		withCapture(resolver<PostgresEntities['tables']>('table', config.hints), tableRenames),
		withCapture(resolver<Column>('column', config.hints), columnRenames),
		withCapture(resolver<View>('view', config.hints), viewRenames),
		withCapture(resolver<UniqueConstraint>('unique', config.hints), uniqueRenames),
		withCapture(resolver<Index>('index', config.hints), indexRenames),
		withCapture(resolver<CheckConstraint>('check', config.hints), checkRenames),
		withCapture(resolver<PrimaryKey>('primary_key', config.hints), pkRenames),
		withCapture(resolver<ForeignKey>('foreign key', config.hints), fkRenames),
		'default',
	);

	if (config.hints.hasMissingHints()) {
		return config.hints.toResponse();
	}

	const downSqlStatements = config.generateDownMigrations
		? (await ddlDiff(
			ddlCur,
			ddlPrev,
			makeInverseResolver(schemaRenames),
			makeInverseResolver(enumRenames),
			makeInverseResolver(seqRenames),
			makeInverseResolver(policyRenames),
			makeInverseResolver(roleRenames),
			makeInverseResolver(privilegeRenames),
			makeInverseResolver(tableRenames),
			makeInverseResolver(columnRenames),
			makeInverseResolver(viewRenames),
			makeInverseResolver(uniqueRenames),
			makeInverseResolver(indexRenames),
			makeInverseResolver(checkRenames),
			makeInverseResolver(pkRenames),
			makeInverseResolver(fkRenames),
			'default',
		)).sqlStatements
		: undefined;

	if (!config.explain) {
		return writeResult({
			snapshot: snapshot,
			sqlStatements,
			downSqlStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'postgresql',
			generateDownMigrations: config.generateDownMigrations,
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
		() => true,
	);

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
	return {
		statements: sqlStatements,
		warnings: warnings.map((it) => postgresSchemaWarning(it)),
	};
};
