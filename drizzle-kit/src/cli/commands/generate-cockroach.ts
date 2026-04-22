import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/cockroach/drizzle';
import { prepareOutFolder } from 'src/utils/utils-node';
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
import { prepareSnapshot } from '../../dialects/cockroach/serializer';
import { resolver } from '../prompts';
import { cockroachSchemaError, cockroachSchemaWarning } from '../views';
import { writeResult } from './generate-common';
import { makeInverseResolver, withCapture } from './generate-down-helpers';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, filenames, casing } = config;

	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(snapshots, filenames, casing);
	if (config.custom) {
		writeResult({
			snapshot: custom,
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			generateDownMigrations: config.generateDownMigrations,
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
	const tableRenames: { from: CockroachEntities['tables']; to: CockroachEntities['tables'] }[] = [];
	const columnRenames: { from: Column; to: Column }[] = [];
	const viewRenames: { from: View; to: View }[] = [];
	const indexRenames: { from: Index; to: Index }[] = [];
	const checkRenames: { from: CheckConstraint; to: CheckConstraint }[] = [];
	const pkRenames: { from: PrimaryKey; to: PrimaryKey }[] = [];
	const fkRenames: { from: ForeignKey; to: ForeignKey }[] = [];

	const { sqlStatements, renames } = await ddlDiff(
		ddlPrev,
		ddlCur,
		withCapture(resolver<Schema>('schema'), schemaRenames),
		withCapture(resolver<Enum>('enum'), enumRenames),
		withCapture(resolver<Sequence>('sequence'), seqRenames),
		withCapture(resolver<Policy>('policy'), policyRenames),
		withCapture(resolver<CockroachEntities['tables']>('table'), tableRenames),
		withCapture(resolver<Column>('column'), columnRenames),
		withCapture(resolver<View>('view'), viewRenames),
		withCapture(resolver<Index>('index'), indexRenames),
		withCapture(resolver<CheckConstraint>('check'), checkRenames),
		withCapture(resolver<PrimaryKey>('primary key'), pkRenames),
		withCapture(resolver<ForeignKey>('foreign key'), fkRenames),
		'default',
	);

	const downSqlStatements = config.generateDownMigrations
		? (await ddlDiff(
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
		)).sqlStatements
		: undefined;

	writeResult({
		snapshot: snapshot,
		sqlStatements,
		downSqlStatements,
		outFolder,
		name: config.name,
		breakpoints: config.breakpoints,
		generateDownMigrations: config.generateDownMigrations,
		renames,
		snapshots,
	});
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);

	// TODO: do we wanna respect entity filter while exporting to sql?
	// cc: @AleksandrSherman
	const { schema, errors, warnings } = fromDrizzleSchema(res, config.casing, () => true);

	if (warnings.length > 0) {
		console.log(warnings.map((it) => cockroachSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		console.log(errors.map((it) => cockroachSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { ddl, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		console.log(errors2.map((it) => cockroachSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	console.log(sqlStatements.join('\n'));
};
