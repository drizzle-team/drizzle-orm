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
import { resolver } from '../prompts';
import { explain, postgresSchemaError, postgresSchemaWarning } from '../views';
import type { CheckHandlerResult } from './check';
import { writeResult } from './generate-common';
import { makeInverseResolver, withCapture } from './generate-down-helpers';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (
	config: GenerateConfig,
	checkResult?: CheckHandlerResult,
) => {
	const { out: outFolder, filenames } = config;

	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(
		snapshots,
		filenames,
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

	const { sqlStatements, renames, groupedStatements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		withCapture(resolver<Schema>('schema'), schemaRenames),
		withCapture(resolver<Enum>('enum'), enumRenames),
		withCapture(resolver<Sequence>('sequence'), seqRenames),
		withCapture(resolver<Policy>('policy'), policyRenames),
		withCapture(resolver<Role>('role'), roleRenames),
		withCapture(resolver<Privilege>('privilege'), privilegeRenames),
		withCapture(resolver<PostgresEntities['tables']>('table'), tableRenames),
		withCapture(resolver<Column>('column'), columnRenames),
		withCapture(resolver<View>('view'), viewRenames),
		withCapture(resolver<UniqueConstraint>('unique'), uniqueRenames),
		withCapture(resolver<Index>('index'), indexRenames),
		withCapture(resolver<CheckConstraint>('check'), checkRenames),
		withCapture(resolver<PrimaryKey>('primary key'), pkRenames),
		withCapture(resolver<ForeignKey>('foreign key'), fkRenames),
		'default',
	);

	const { sqlStatements: downSqlStatements } = await ddlDiff(
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
	);

	const explainMessage = explain('postgres', groupedStatements, false, []);
	if (explainMessage) console.log(explainMessage);

	writeResult({
		snapshot: snapshot,
		sqlStatements,
		downSqlStatements,
		outFolder,
		name: config.name,
		breakpoints: config.breakpoints,
		renames,
		snapshots,
	});
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);
	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema, errors, warnings } = fromDrizzleSchema(
		res,
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
