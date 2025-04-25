import { fromJson } from './convertor';
import { fullTableFromDDL, MysqlDDL } from './ddl';
import { prepareStatement } from './statements';

export const ddlDiffDry = async (ddl: MysqlDDL) => {
	const createTableStatements = ddl.tables.list().map((it) => {
		const full = fullTableFromDDL(it, ddl);
		return prepareStatement('create_table', { table: full });
	});

	const createIndexesStatements = ddl.indexes.list().map((it) => prepareStatement('create_index', { index: it }));
	const createFKsStatements = ddl.fks.list().map((it) => prepareStatement('create_fk', { fk: it }));

	const statements = [
		...createTableStatements,
		...createFKsStatements,
		...createIndexesStatements,
	];

	const res = fromJson(statements);
	return res;
};
