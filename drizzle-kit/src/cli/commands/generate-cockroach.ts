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
import type { JsonStatement } from '../../dialects/cockroach/statements';
import { CommandOutputCliError } from '../errors';
import { JsonModeUnsupportedCliError } from '../errors';
import { isJsonMode } from '../mode';
import { resolver } from '../prompts';
import { cockroachSchemaError, cockroachSchemaWarning, explain, humanLog, printJsonOutput } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	if (isJsonMode()) {
		throw new JsonModeUnsupportedCliError({ dialect: 'cockroach', command: 'generate' });
	}

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
			type: 'custom',
			renames: [],
			snapshots,
		});
		return;
	}

	let sqlStatements: string[] = [];
	let renames: string[] = [];
	let groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[] = [];

	const diffResult = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema', 'public', 'generate'),
		resolver<Enum>('enum', 'public', 'generate'),
		resolver<Sequence>('sequence', 'public', 'generate'),
		resolver<Policy>('policy', 'public', 'generate'),
		resolver<CockroachEntities['tables']>('table', 'public', 'generate'),
		resolver<Column>('column', 'public', 'generate'),
		resolver<View>('view', 'public', 'generate'),
		resolver<Index>('index', 'public', 'generate'),
		resolver<CheckConstraint>('check', 'public', 'generate'),
		resolver<PrimaryKey>('primary key', 'public', 'generate'),
		resolver<ForeignKey>('foreign key', 'public', 'generate'),
		'default',
	);

	sqlStatements = diffResult.sqlStatements;
	renames = diffResult.renames;
	groupedStatements = diffResult.groupedStatements;

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
		humanLog(warnings.map((it) => cockroachSchemaWarning(it)).join('\n\n'));
	}

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
	printJsonOutput({ sqlStatements });
	humanLog(sqlStatements.join('\n'));
};
