import { fromDatabase as fd } from 'src/dialects/mysql/introspect';
import type {
	CheckConstraint,
	Column,
	ForeignKey,
	Index,
	InterimColumn,
	InterimSchema,
	MysqlEntities,
	PrimaryKey,
	View,
	ViewColumn,
} from '../dialects/mysql/ddl';
import { interimToDDL } from '../dialects/mysql/ddl';
import { ddlDiff } from '../dialects/mysql/diff';
import { mockResolver } from '../utils/mocks';

export type Interim<T> = Omit<T, 'entityType'>;

export type InterimTable = {
	name: string;
	columns: Interim<InterimColumn>[];
	indexes: Interim<Index>[];
	checks: Interim<CheckConstraint>[];
	pks: Interim<PrimaryKey>[];
	fks: Interim<ForeignKey>[];
};

export type InterimView = {
	name: string;
	columns: Interim<Column>[];
	definition: string;
	algorithm: 'undefined' | 'merge' | 'temptable';
	sqlSecurity: 'definer' | 'invoker';
	withCheckOption: 'local' | 'cascaded' | null;
};

export type InterimStudioSchema = {
	tables: InterimTable[];
	views: InterimView[];
};

const fromInterims = ({
	tables,
	views,
}: InterimStudioSchema): InterimSchema => {
	const tbls: MysqlEntities['tables'][] = tables.map((it) => ({
		entityType: 'tables',
		name: it.name,
	}));
	const columns: InterimColumn[] = tables
		.map((table) => {
			return table.columns.map((it) => {
				return {
					entityType: 'columns',
					...it,
				} satisfies InterimColumn;
			});
		})
		.flat(1);

	const indexes: Index[] = tables
		.map((table) => {
			return table.indexes.map((it) => {
				return { entityType: 'indexes', ...it } satisfies Index;
			});
		})
		.flat(1);

	const checks: CheckConstraint[] = tables
		.map((table) => {
			return table.checks.map((it) => {
				return { entityType: 'checks', ...it } satisfies CheckConstraint;
			});
		})
		.flat(1);
	const fks: ForeignKey[] = tables
		.map((table) => {
			return table.fks.map((it) => {
				return { entityType: 'fks', ...it } satisfies ForeignKey;
			});
		})
		.flat(1);
	const pks: PrimaryKey[] = tables
		.map((table) => {
			return table.pks.map((it) => {
				return { entityType: 'pks', ...it } satisfies PrimaryKey;
			});
		})
		.flat(1);

	const vws: View[] = views.map(({ columns: _, ...it }) => {
		return {
			entityType: 'views',
			algorithm: it.algorithm,
			definition: it.definition,
			name: it.name,
			sqlSecurity: it.sqlSecurity,
			withCheckOption: it.withCheckOption,
		};
	});
	const viewColumns: ViewColumn[] = views
		.map((table) => {
			return table.columns.map((it) => {
				return {
					view: table.name,
					...it,
				} satisfies ViewColumn;
			});
		})
		.flat(1);

	return {
		tables: tbls,
		columns: columns,
		pks,
		fks,
		checks,
		indexes,
		views: vws,
		viewColumns,
	};
};

export const diffMySql = async (from: InterimStudioSchema, to: InterimStudioSchema, renamesArr: string[]) => {
	const { ddl: ddl1 } = interimToDDL(fromInterims(from));
	const { ddl: ddl2 } = interimToDDL(fromInterims(to));

	const renames = new Set(renamesArr);

	const { sqlStatements, groupedStatements, statements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'default',
	);

	return { sqlStatements, groupedStatements, statements };
};

export const fromDatabase = fd;
