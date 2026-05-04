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
import { isJsonMode } from '../context';
import { resolver } from '../prompts';
import {
	cockroachSchemaError,
	cockroachSchemaWarning,
	explain,
	explainJsonOutput,
	humanLog,
	printJsonOutput,
} from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, filenames, casing } = config;
	const json = isJsonMode();

	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(snapshots, filenames, casing);
	if (config.custom) {
		writeResult({
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
		return;
	}

	const { sqlStatements, renames, groupedStatements, statements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema', 'public', config.hints),
		resolver<Enum>('enum', 'public', config.hints),
		resolver<Sequence>('sequence', 'public', config.hints),
		resolver<Policy>('policy', 'public', config.hints),
		resolver<CockroachEntities['tables']>('table', 'public', config.hints),
		resolver<Column>('column', 'public', config.hints),
		resolver<View>('view', 'public', config.hints),
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
			dialect: 'cockroach',
			renames,
			snapshots,
		});
		return;
	}

	if (json) {
		if (sqlStatements.length === 0) {
			printJsonOutput({ status: 'no_changes', dialect: 'cockroach' });
			return;
		}
		printJsonOutput(explainJsonOutput('cockroach', statements, []));
		return;
	}

	const explainMessage = explain('cockroach', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}
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
