import { mockResolver } from '../../utils/mocks';
import type { Resolver } from '../common';
import type { Column, MysqlDDL, Table, View } from '../mysql/ddl';
import { ddlDiff as mysqlDdlDiff } from '../mysql/diff';
import type { JsonStatement } from '../mysql/statements';

export const ddlDiffDry = async (from: MysqlDDL, to: MysqlDDL) => {
	const s = new Set<string>();
	return ddlDiff(from, to, mockResolver(s), mockResolver(s), mockResolver(s), 'default');
};

export const ddlDiff = async (
	ddl1: MysqlDDL,
	ddl2: MysqlDDL,
	tablesResolver: Resolver<Table>,
	columnsResolver: Resolver<Column>,
	viewsResolver: Resolver<View>,
	mode: 'default' | 'push',
): Promise<{
	statements: JsonStatement[];
	sqlStatements: string[];
	groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[];
	renames: string[];
}> => {
	const res = await mysqlDdlDiff(ddl1, ddl2, tablesResolver, columnsResolver, viewsResolver, mode);

	const statements: JsonStatement[] = [];
	const sqlStatements: string[] = [];

	for (const it of res.groupedStatements) {
		const st = it.jsonStatement;
		if (st.type === 'create_index' && st.index.isUnique) continue;
		if (st.type === 'alter_column') {
			if (st.diff.type) continue;
			if (st.diff.autoIncrement) continue;
			if (st.diff.default && st.column.notNull) continue;
			if (st.diff.notNull) continue;
		}
		if (st.type === 'create_pk' || st.type === 'drop_pk') continue;

		statements.push(it.jsonStatement);
		sqlStatements.push(...it.sqlStatements);
	}

	return {
		statements,
		sqlStatements,
		groupedStatements: res.groupedStatements,
		renames: res.renames,
	};
};
