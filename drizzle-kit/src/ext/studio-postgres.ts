import { fromDatabase as afd } from 'src/dialects/postgres/aws-introspect';
import { fromDatabase as dfd } from 'src/dialects/postgres/duckdb-introspect';
import { fromDatabase as fd } from 'src/dialects/postgres/introspect';
import type {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	InterimColumn,
	InterimIndex,
	InterimSchema,
	Policy,
	PostgresEntities,
	PrimaryKey,
	Privilege,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
	ViewColumn,
} from '../dialects/postgres/ddl';
import { interimToDDL } from '../dialects/postgres/ddl';
import { ddlDiff } from '../dialects/postgres/diff';
import { mockResolver } from '../utils/mocks';

export type Interim<T> = Omit<T, 'entityType'>;

export type InterimTable = {
	schema: string;
	name: string;
	columns: Interim<InterimColumn>[];
	indexes: Interim<InterimIndex>[];
	checks: Interim<CheckConstraint>[];
	uniques: Interim<UniqueConstraint>[];
	pks: Interim<PrimaryKey>[];
	fks: Interim<ForeignKey>[];
	isRlsEnabled: boolean;
};

export type InterimView = {
	schema: string;
	name: string;
	materialized: boolean;
	columns: Interim<Column>[];
	definition: string | null;
};

export type InterimStudioSchema = {
	schemas: Schema[];
	tables: InterimTable[];
	views: InterimView[];
	enums: Enum[];
	sequences: Sequence[];
	roles: Role[];
	privileges: Privilege[];
	policies: Policy[];
};

const fromInterims = ({
	schemas,
	tables,
	enums,
	policies,
	roles,
	privileges,
	sequences,
	views,
}: InterimStudioSchema): InterimSchema => {
	const tbls: PostgresEntities['tables'][] = tables.map((it) => ({
		entityType: 'tables',
		name: it.name,
		schema: it.schema,
		isRlsEnabled: it.isRlsEnabled,
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

	const indexes: InterimIndex[] = tables
		.map((table) => {
			return table.indexes.map((it) => {
				return { entityType: 'indexes', ...it } satisfies InterimIndex;
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
	const uniques: UniqueConstraint[] = tables
		.map((table) => {
			return table.uniques.map((it) => {
				return { entityType: 'uniques', ...it } satisfies UniqueConstraint;
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
			tablespace: it.schema,
			using: null,
			with: null,
			withNoData: null,
			definition: it.definition,
			materialized: it.materialized,
			name: it.name,
			schema: it.schema,
		};
	});
	const viewColumns: ViewColumn[] = views
		.map((table) => {
			return table.columns.map((it) => {
				return {
					view: table.name,
					typeDimensions: 0, // never user in studio
					...it,
				} satisfies ViewColumn;
			});
		})
		.flat(1);

	return {
		schemas,
		tables: tbls,
		columns: columns,
		pks,
		fks,
		checks,
		uniques,
		indexes,
		views: vws,
		viewColumns,
		enums,
		sequences,
		roles,
		privileges,
		policies,
	};
};

export const diffPostgresql = async (from: InterimStudioSchema, to: InterimStudioSchema, renamesArr: string[]) => {
	const { ddl: ddl1 } = interimToDDL(fromInterims(from));
	const { ddl: ddl2 } = interimToDDL(fromInterims(to));

	const renames = new Set(renamesArr);

	const { sqlStatements, groupedStatements, statements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames), // views
		mockResolver(renames), // uniques
		mockResolver(renames), // indexes
		mockResolver(renames), // checks
		mockResolver(renames), // pks
		'default',
	);

	return { sqlStatements, groupedStatements, statements };
};

export const fromDatabase = fd;
export const fromAwsDatabase = afd;
export const fromDuckDbDatabase = dfd;
