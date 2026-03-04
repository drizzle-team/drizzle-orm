import { fromDatabase as fd } from 'src/dialects/sqlite/introspect';
import type {
	CheckConstraint,
	Column,
	ForeignKey,
	Index,
	InterimColumn,
	InterimSchema,
	PrimaryKey,
	SqliteEntities,
	UniqueConstraint,
	View,
} from '../dialects/sqlite/ddl';
import { interimToDDL } from '../dialects/sqlite/ddl';
import { ddlDiff } from '../dialects/sqlite/diff';
import { mockResolver } from '../utils/mocks';

export type Interim<T> = Omit<T, 'entityType'>;

export type InterimTable = {
	name: string;
	columns: Interim<InterimColumn>[];
	indexes: Interim<Index>[];
	checks: Interim<CheckConstraint>[];
	uniques: Interim<UniqueConstraint>[];
	pks: Interim<PrimaryKey>[];
	fks: Interim<ForeignKey>[];
};

export type InterimView = {
	name: string;
	columns: Interim<Column>[];
	definition: string | null;
};

export type InterimStudioSchema = {
	tables: InterimTable[];
	views: InterimView[];
};

const fromInterims = (tables: InterimTable[], views: InterimView[]): InterimSchema => {
	const tbls: SqliteEntities['tables'][] = tables.map((it) => ({
		entityType: 'tables',
		name: it.name,
	}));
	const columns: InterimColumn[] = tables.map((table) => {
		return table.columns.map((it) => {
			return {
				entityType: 'columns',
				...it,
			} satisfies InterimColumn;
		});
	}).flat(1);

	const indexes: Index[] = tables.map((table) => {
		return table.indexes.filter((it) => it.origin === 'manual').map((it) => {
			return { entityType: 'indexes', ...it } satisfies Index;
		});
	}).flat(1);

	const checks: CheckConstraint[] = tables.map((table) => {
		return table.checks.map((it) => {
			return { entityType: 'checks', ...it } satisfies CheckConstraint;
		});
	}).flat(1);
	const uniques: UniqueConstraint[] = tables.map((table) => {
		return table.uniques.map((it) => {
			return { entityType: 'uniques', ...it } satisfies UniqueConstraint;
		});
	}).flat(1);
	const fks: ForeignKey[] = tables.map((table) => {
		return table.fks.map((it) => {
			return { entityType: 'fks', ...it } satisfies ForeignKey;
		});
	}).flat(1);
	const pks: PrimaryKey[] = tables.map((table) => {
		return table.pks.map((it) => {
			return { entityType: 'pks', ...it } satisfies PrimaryKey;
		});
	}).flat(1);

	const vws: View[] = views.map((it) => {
		return { entityType: 'views', isExisting: false, error: null, definition: it.definition, name: it.name };
	});

	return {
		tables: tbls,
		columns: columns,
		pks,
		fks,
		checks,
		uniques,
		indexes,
		views: vws,
	};
};

export const diffSqlite = async (
	from: InterimStudioSchema,
	to: InterimStudioSchema,
	renamesArr: string[],
) => {
	const renames = new Set(renamesArr);
	const { ddl: ddl1 } = interimToDDL(fromInterims(from.tables, from.views));
	const { ddl: ddl2 } = interimToDDL(fromInterims(to.tables, to.views));

	const { sqlStatements, statements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		'default',
	);

	return { sqlStatements, statements, groupedStatements };
};

export const fromDatabase = fd;
