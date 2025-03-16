import {
	CheckConstraint,
	Column,
	createDDL,
	ForeignKey,
	Index,
	PrimaryKey,
	SqliteEntities,
	SqliteEntity,
	UniqueConstraint,
	View,
} from '../dialects/sqlite/ddl';
import { applySqliteSnapshotsDiff } from '../dialects/sqlite/differ';
import { mockColumnsResolver, mockTablesResolver } from './mocks';

export type Interim<T> = Omit<T, 'entityType'>;

export type InterimTable = {
	name: string;
	columns: Interim<Column>[];
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

export type InterimSchema = {
	tables: InterimTable[];
	views: InterimView[];
};

const fromInterims = (tables: InterimTable[], views: InterimView[]): SqliteEntity[] => {
	const tbls: SqliteEntities['tables'][] = tables.map((it) => ({
		entityType: 'tables',
		name: it.name,
	}));
	const columns: Column[] = tables.map((table) => {
		return table.columns.map((it) => {
			return {
				entityType: 'columns',
				...it,
			} satisfies Column;
		});
	}).flat(1);

	const indexes: Index[] = tables.map((table) => {
		return table.indexes.map((it) => {
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
		return { entityType: 'views', isExisting: false, ...it };
	});

	return [...tbls, ...columns, ...indexes, ...checks, ...uniques, ...fks, ...pks, ...vws];
};

export const diffSqlite = async (
	from: InterimSchema,
	to: InterimSchema,
	renamesArr: string[],
) => {
	const renames = new Set(renamesArr);
	const ddl1 = createDDL();
	const ddl2 = createDDL();

	const entitiesFrom = fromInterims(from.tables, from.views);
	const entitiesTo = fromInterims(to.tables, to.views);

	for (const entity of entitiesFrom) {
		ddl1.entities.insert(entity);
	}
	for (const entity of entitiesTo) {
		ddl2.entities.insert(entity);
	}

	const { sqlStatements, statements, groupedStatements } = await applySqliteSnapshotsDiff(
		ddl1,
		ddl2,
		mockTablesResolver(renames),
		mockColumnsResolver(renames),
		'generate',
	);

	return { sqlStatements, statements, groupedStatements };
};
