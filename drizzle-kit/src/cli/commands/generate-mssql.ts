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
import { CommandOutputCliError } from '../errors';
import { isJsonMode } from '../mode';
import { resolver } from '../prompts';
import { withStyle } from '../validations/outputs';
import { explain, explainJsonOutput, humanLog, mssqlSchemaError, printJsonOutput } from '../views';
import { writeResult } from './generate-common';
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
			type: 'custom',
			renames: [],
			snapshots,
		});
		return;
	}

	const { sqlStatements, renames, statements, groupedStatements } = await ddlDiff(
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

	const recreateIdentity = statements.find((it) => it.type === 'recreate_identity_column');
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

	if (config.explain) {
		if (isJsonMode()) {
			const explainOutput = explainJsonOutput('mssql', statements, []);
			printJsonOutput(explainOutput);
		} else {
			const explainMessage = explain('mssql', groupedStatements, []);
			if (explainMessage) {
				humanLog(explainMessage);
			}
		}
		return;
	}

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
