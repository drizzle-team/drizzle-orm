import chalk from 'chalk';
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
import { ddlDiff, ddlDiffDry } from '../../dialects/mssql/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/mssql/drizzle';
import { prepareSnapshot } from '../../dialects/mssql/serializer';
import type { JsonStatement } from '../../dialects/mssql/statements';
import { prepareOutFolder } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { withStyle } from '../validations/outputs';
import { explain, explainJsonOutput, humanLog, mssqlSchemaError } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, filenames } = config;
	const json = outputFormat() === 'json';
	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(snapshots, filenames);

	if (config.custom) {
		return writeResult({
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
	}

	const { sqlStatements, renames, groupedStatements, statements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema', config.hints, 'dbo'),
		resolver<MssqlEntities['tables']>('table', config.hints, 'dbo'),
		resolver<Column>('column', config.hints, 'dbo'),
		resolver<View>('view', config.hints, 'dbo'),
		resolver<UniqueConstraint>('unique', config.hints, 'dbo'),
		resolver<Index>('index', config.hints, 'dbo'),
		resolver<CheckConstraint>('check', config.hints, 'dbo'),
		resolver<PrimaryKey>('primary_key', config.hints, 'dbo'),
		resolver<ForeignKey>('foreign key', config.hints, 'dbo'),
		resolver<DefaultConstraint>('default', config.hints, 'dbo'),
		'default',
	);

	if (config.hints.hasMissingHints()) {
		return config.hints.toResponse();
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
		return writeResult({
			snapshot: snapshot,
			sqlStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'mssql',
			renames,
			snapshots,
		});
	}

	if (json) {
		if (sqlStatements.length === 0) {
			return { status: 'no_changes' as const, dialect: 'mssql' };
		}
		return explainJsonOutput('mssql', statements, []);
	}

	const explainMessage = explain('mssql', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}

	return { status: 'ok' as const, dialect: 'mssql' };
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);

	// TODO: do we want to respect config filter here?
	// cc: @AleksandrSherman
	const { schema, errors } = fromDrizzleSchema(res, () => true);

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
	return { statements: sqlStatements, warnings: [] };
};
