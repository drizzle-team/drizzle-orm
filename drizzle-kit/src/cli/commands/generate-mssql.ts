import { ddlDiff, ddlDiffDry } from 'src/dialects/mssql/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/mssql/drizzle';
import { prepareSnapshot } from 'src/dialects/mssql/serializer';
import { prepareFilenames } from 'src/utils/utils-node';
import { createDDL, DefaultConstraint } from '../../dialects/mssql/ddl';
import {
	CheckConstraint,
	Column,
	ForeignKey,
	Index,
	interimToDDL,
	MssqlEntities,
	PrimaryKey,
	Schema,
	UniqueConstraint,
	View,
} from '../../dialects/mssql/ddl';
import { assertV1OutFolder, prepareMigrationFolder } from '../../utils/utils-node';
import { resolver } from '../prompts';
import { writeResult } from './generate-common';
import { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, schema: schemaPath, casing } = config;

	assertV1OutFolder(outFolder);

	const { snapshots, journal } = prepareMigrationFolder(outFolder, 'mssql');
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(snapshots, schemaPath, casing);

	if (config.custom) {
		writeResult({
			snapshot: custom,
			sqlStatements: [],
			journal,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			type: 'custom',
			prefixMode: config.prefix,
			renames: [],
		});
		return;
	}

	const { sqlStatements, renames, statements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema', 'dbo'),
		resolver<MssqlEntities['tables']>('table', 'dbo'),
		resolver<Column>('column', 'dbo'),
		resolver<View>('view', 'dbo'),
		resolver<UniqueConstraint>('unique', 'dbo'), // uniques
		resolver<Index>('index', 'dbo'), // indexes
		resolver<CheckConstraint>('check', 'dbo'), // checks
		resolver<PrimaryKey>('primary key', 'dbo'), // pks
		resolver<ForeignKey>('foreign key', 'dbo'), // fks
		resolver<DefaultConstraint>('default', 'dbo'), // fks
		'default',
	);

	// TODO add hint for recreating identity column
	// const recreateIdentity = statements.find((it) => it.type === 'recreate_identity_column');
	// if (
	// 	recreateIdentity && Boolean(recreateIdentity.column.identity?.to)
	// 	&& !Boolean(recreateIdentity.column.identity?.from)
	// ) {
	// 	console.log(
	// 		withStyle.warning(
	// 			chalk.bold('You are about to add an identity to an existing column.')
	// 				+ '\n'
	// 				+ 'This change may lead to data loss because the column will need to be recreated because identity columns cannot be added to existing ones and do not allow manual value insertion.'
	// 				+ '\n'
	// 				+ chalk.bold('Are you sure you want to continue?'),
	// 		),
	// 	);
	// 	const { status, data } = await render(new Select(['No, abort', `Yes, proceed`]));
	// 	if (data?.index === 0) {
	// 		render(`[${chalk.red('x')}] All changes were aborted`);
	// 		process.exit(0);
	// 	}
	// }

	writeResult({
		snapshot: snapshot,
		sqlStatements,
		journal,
		outFolder,
		name: config.name,
		breakpoints: config.breakpoints,
		prefixMode: config.prefix,
		renames,
	});
};

export const handleExport = async (config: ExportConfig) => {
	const filenames = prepareFilenames(config.schema);
	const res = await prepareFromSchemaFiles(filenames);
	const schema = fromDrizzleSchema(res, config.casing);
	const { ddl } = interimToDDL(schema);
	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	console.log(sqlStatements.join('\n'));
};
