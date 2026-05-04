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
import { isJsonMode } from '../context';
import { resolver } from '../prompts';
import { withStyle } from '../validations/outputs';
import { explain, explainJsonOutput, humanLog, mssqlSchemaError, printJsonOutput } from '../views';
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
			dialect: 'mssql',
			type: 'custom',
			renames: [],
			snapshots,
		});
		return;
	}

	const { sqlStatements, renames, groupedStatements, statements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema', 'dbo', config.hints),
		resolver<MssqlEntities['tables']>('table', 'dbo', config.hints),
		resolver<Column>('column', 'dbo', config.hints),
		resolver<View>('view', 'dbo', config.hints),
		resolver<UniqueConstraint>('unique', 'dbo', config.hints),
		resolver<Index>('index', 'dbo', config.hints),
		resolver<CheckConstraint>('check', 'dbo', config.hints),
		resolver<PrimaryKey>('primary key', 'dbo', config.hints),
		resolver<ForeignKey>('foreign key', 'dbo', config.hints),
		resolver<DefaultConstraint>('default', 'dbo', config.hints),
		'default',
	);

	if (json && config.hints.hasMissingHints()) {
		config.hints.emitAndExit();
	}

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
			dialect: 'mssql',
			renames,
			snapshots,
		});
		return;
	}

	if (json) {
		if (sqlStatements.length === 0) {
			printJsonOutput({ status: 'no_changes', dialect: 'mssql' });
			return;
		}
		printJsonOutput(explainJsonOutput('mssql', statements, []));
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
		console.log(errors.map((it) => mssqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { ddl, errors: errors2 } = interimToDDL(schema);
	if (errors2.length > 0) {
		console.log(errors.map((it) => mssqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	console.log(sqlStatements.join('\n'));
};
