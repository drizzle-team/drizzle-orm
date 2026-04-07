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
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { explain, humanLog, postgresSchemaError, postgresSchemaWarning, printJsonOutput } from '../views';
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

	const { sqlStatements, renames, groupedStatements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema'),
		resolver<Enum>('enum'),
		resolver<Sequence>('sequence'),
		resolver<Policy>('policy'),
		resolver<Role>('role'),
		resolver<Privilege>('privilege'),
		resolver<PostgresEntities['tables']>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		resolver<UniqueConstraint>('unique'),
		resolver<Index>('index'),
		resolver<CheckConstraint>('check'),
		resolver<PrimaryKey>('primary key'),
		resolver<ForeignKey>('foreign key'),
		'default',
	);

	const explainMessage = explain('postgres', groupedStatements, false, []);
	if (explainMessage) humanLog(explainMessage);

	writeResult({
		snapshot: snapshot,
		sqlStatements,
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
