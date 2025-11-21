import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/postgres/drizzle';
import { prepareFilenames, prepareOutFolder } from 'src/utils/utils-node';
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
import { withStyle } from '../validations/outputs';
import { psqlExplain } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, schema: schemaPath, casing } = config;

	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(snapshots, schemaPath, casing);

	if (config.custom) {
		writeResult({
			snapshot: custom,
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			type: 'custom',
			prefixMode: config.prefix,
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

	const messages: string[] = [`\n\nThe following migration was generated:\n`];
	for (const { jsonStatement, sqlStatements: sql } of groupedStatements) {
		const msg = psqlExplain(jsonStatement, sql);
		if (msg) messages.push(msg);
		else messages.push(...sql);
	}
	console.log(withStyle.info(messages.join('\n')));

	writeResult({
		snapshot: snapshot,
		sqlStatements,
		outFolder,
		name: config.name,
		breakpoints: config.breakpoints,
		prefixMode: config.prefix,
		renames,
		snapshots,
	});
};

export const handleExport = async (config: ExportConfig) => {
	const filenames = prepareFilenames(config.schema);
	const res = await prepareFromSchemaFiles(filenames);
	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema } = fromDrizzleSchema(res, config.casing, () => true);
	const { ddl } = interimToDDL(schema);
	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	console.log(sqlStatements.join('\n'));
};
