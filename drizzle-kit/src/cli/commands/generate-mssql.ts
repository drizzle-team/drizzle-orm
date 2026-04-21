import chalk from 'chalk';
import { ddlDiff, ddlDiffDry } from 'src/dialects/mssql/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/mssql/drizzle';
import { prepareSnapshot } from 'src/dialects/mssql/serializer';
import { prepareOutFolder } from 'src/utils/utils-node';
import { createDDL, type DefaultConstraint, interimToDDL } from '../../dialects/mssql/ddl';
import type {
	CheckConstraint,
	Column,
	ForeignKey,
	Index,
	MssqlEntities,
	PrimaryKey,
	Schema,
	UniqueConstraint,
	View,
} from '../../dialects/mssql/ddl';
import type { JsonStatement } from '../../dialects/mssql/statements';
import { CommandOutputCliError } from '../errors';
import { JsonModeUnsupportedCliError } from '../errors';
import { isJsonMode } from '../mode';
import { resolver } from '../prompts';
import { withStyle } from '../validations/outputs';
import { explain, humanLog, mssqlSchemaError, printJsonOutput } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	if (isJsonMode()) {
		throw new JsonModeUnsupportedCliError({ dialect: 'mssql', command: 'generate' });
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
	let statements: JsonStatement[] = [];
	let groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[] = [];

	const diffResult = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema', 'dbo', 'generate'),
		resolver<MssqlEntities['tables']>('table', 'dbo', 'generate'),
		resolver<Column>('column', 'dbo', 'generate'),
		resolver<View>('view', 'dbo', 'generate'),
		resolver<UniqueConstraint>('unique', 'dbo', 'generate'),
		resolver<Index>('index', 'dbo', 'generate'),
		resolver<CheckConstraint>('check', 'dbo', 'generate'),
		resolver<PrimaryKey>('primary key', 'dbo', 'generate'),
		resolver<ForeignKey>('foreign key', 'dbo', 'generate'),
		resolver<DefaultConstraint>('default', 'dbo', 'generate'),
		'default',
	);

	sqlStatements = diffResult.sqlStatements;
	renames = diffResult.renames;
	statements = diffResult.statements;
	groupedStatements = diffResult.groupedStatements;

	const recreateIdentity = statements.find((it): it is Extract<JsonStatement, { type: 'recreate_identity_column' }> =>
		it.type === 'recreate_identity_column'
	);
	if (
		recreateIdentity && Boolean(recreateIdentity.column.identity?.to)
		&& !recreateIdentity.column.identity?.from
	) {
		humanLog(
			withStyle.warning(
				chalk.red.bold('You are about to add an identity property to an existing column.')
					+ '\n'
					+ chalk.red(
						'This operation may result in data loss as the column must be recreated. Identity columns cannot be added to existing ones and do not permit manual value insertion.',
					)
					+ '\n'
					+ chalk.red('All existing data in the column will be overwritten with new identity values'),
			),
		);
	}

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

	const explainMessage = explain('mssql', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);

	// TODO: do we want to respect config filter here?
	// cc: @AleksandrSherman
	const { schema, errors } = fromDrizzleSchema(res, config.casing, () => true);

	if (errors.length > 0) {
		throw new CommandOutputCliError('export', errors.map((it) => mssqlSchemaError(it)).join('\n'), {
			stage: 'schema',
			dialect: 'mssql',
		});
	}

	const { ddl, errors: errors2 } = interimToDDL(schema);
	if (errors2.length > 0) {
		throw new CommandOutputCliError('export', errors2.map((it) => mssqlSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'mssql',
		});
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	printJsonOutput({ sqlStatements });
	humanLog(sqlStatements.join('\n'));
};
