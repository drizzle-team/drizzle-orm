import { type Column, createDDL, interimToDDL, type MysqlDDL, type Table, type View } from '../../dialects/mysql/ddl';
import { ddlDiff, ddlDiffDry } from '../../dialects/mysql/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/mysql/drizzle';
import { prepareSnapshot } from '../../dialects/mysql/serializer';
import type { JsonStatement } from '../../dialects/mysql/statements';
import { prepareOutFolder } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { withStyle } from '../validations/outputs';
import { explain, explainJsonOutput, humanLog, mysqlSchemaError } from '../views';
import type { CheckHandlerResult } from './check';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const suggestions = (
	jsonStatements: JsonStatement[],
	ddl2: MysqlDDL,
) => {
	const grouped: { hints: string[]; errors: string[] } = {
		errors: [],
		hints: [],
	};

	for (const statement of jsonStatements) {
		if (statement.type === 'create_fk' && statement.cause !== 'alter_pk') {
			const { columnsTo, table, tableTo, columns } = statement.fk;

			const indexes = ddl2.indexes.list({ isUnique: true, table: tableTo });
			const pk = ddl2.pks.one({ table: tableTo });

			const columnsToSet = new Set(columnsTo);

			const isUniqueFound = indexes.some((index) => {
				if (index.columns.length !== columnsToSet.size) {
					return false;
				}

				return index.columns.every((col) => columnsToSet.has(col.value));
			});

			const isPkFound = pk
				&& pk.columns.length === columnsToSet.size
				&& pk.columns.every((col) => columnsToSet.has(col));

			if (isPkFound || isUniqueFound) continue;

			let composite = columnsTo.length > 1 ? 'composite ' : '';
			grouped.errors.push(
				`You are trying to add reference from "${table}" ("${columns.join('", ')}") to "${tableTo}" ("${
					columnsTo.join(
						'", ',
					)
				}"). The referenced columns are not guaranteed to be unique together. A foreign key must point to a PRIMARY KEY or a set of columns with a UNIQUE constraint. You should add a ${composite}unique constraint to the referenced columns`,
			);

			continue;
		}

		if (statement.type === 'drop_pk') {
			const { table, columns } = statement.pk;

			const fks = ddl2.fks.list({ tableTo: table });
			const indexes = ddl2.indexes.list({ table: table });

			const fkFound = fks.filter((fk) => {
				if (fk.columnsTo.length !== columns.length) return false;

				return fk.columnsTo.every((fkCol) => columns.includes(fkCol));
			});

			if (fkFound.length === 0) continue;

			const indexesFound = indexes.some((index) => {
				if (index.columns.length !== columns.length) {
					return false;
				}

				return index.columns.every((col) => columns.includes(col.value));
			});

			if (indexesFound) continue;

			grouped.errors.push(
				`You are trying to drop primary key from "${table}" ("${
					columns.join(
						'", ',
					)
				}"), but there is an existing reference on this column. You must either add a UNIQUE constraint to ("${
					columns.join(
						'", ',
					)
				}") or drop the foreign key constraint that references this column.`,
			);

			continue;
		}
	}

	return grouped;
};

export const handle = async (
	config: GenerateConfig,
	checkResult?: CheckHandlerResult,
) => {
	const { out: outFolder, filenames } = config;
	const json = outputFormat() === 'json';

	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(
		snapshots,
		filenames,
		checkResult,
	);

	if (config.custom) {
		return writeResult({
			snapshot: custom,
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'mysql',
			type: 'custom',
			renames: [],
			snapshots,
		});
	}

	const { sqlStatements, renames, groupedStatements, statements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Table>('table', config.hints),
		resolver<Column>('column', config.hints),
		resolver<View>('view', config.hints),
		'default',
	);

	if (config.hints.hasMissingHints()) {
		return config.hints.toResponse();
	}

	const { errors } = suggestions(statements, ddlCur);
	if (errors.length) {
		throw new CommandOutputCliError('generate', errors.map((err) => withStyle.errorWarning(err)).join('\n\n'), {
			stage: 'suggestions',
			dialect: 'mysql',
		});
	}

	if (config.explain) {
		if (json) {
			if (sqlStatements.length === 0) {
				return { status: 'no_changes' as const, dialect: 'mysql' };
			}
			return explainJsonOutput('mysql', statements, []);
		}
		const explainMessage = explain('mysql', groupedStatements, []);
		if (explainMessage) {
			humanLog(explainMessage);
		}
		return { status: 'ok' as const, dialect: 'mysql' };
	}

	return writeResult({
		snapshot,
		sqlStatements,
		outFolder,
		name: config.name,
		breakpoints: config.breakpoints,
		dialect: 'mysql',
		renames,
		snapshots,
	});
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);
	const schema = fromDrizzleSchema(res.tables, res.views);
	const { ddl, errors } = interimToDDL(schema);

	if (errors.length > 0) {
		throw new CommandOutputCliError('export', errors.map((it) => mysqlSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'mysql',
		});
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	return { statements: sqlStatements, warnings: [] };
};
