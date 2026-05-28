import type { SchemaForPull } from 'src/cli/commands/pull-common';
import { create } from '../dialect';
import { nameForPk, nameForUnique } from './grammar';

export const createDDL = () => {
	return create({
		tables: {},
		columns: {
			table: 'required',
			type: 'string',
			notNull: 'boolean',
			autoincrement: 'boolean?',
			default: 'string?',
			generated: {
				type: ['stored', 'virtual'],
				as: 'string',
			},
		},
		indexes: {
			table: 'required',
			columns: [{
				value: 'string',
				isExpression: 'boolean',
			}],
			isUnique: 'boolean',
			where: 'string?',
			origin: [
				'manual', // ='c' CREATE INDEX
				'auto', // ='u' UNIQUE auto created
			], // https://www.sqlite.org/pragma.html#pragma_index_list
		},
		// Names for fk was decided to leave as is after discussion with @AlexBlokh
		// Discussion was about removing "name" from ts schema
		//
		// introspect will parse ddl and find names. Old kit (before beta v1) did not add names to fk in sql migrations
		// after upping to beta v1 there would be recreate table to correct name for push if name was explicitly set by user
		//
		// We already have tests on preserving names after renaming tables/columns
		// It was important that newcomers would not experience any issues
		fks: {
			table: 'required',
			columns: 'string[]',
			tableTo: 'string',
			columnsTo: 'string[]',
			onUpdate: 'string',
			onDelete: 'string',
			nameExplicit: 'boolean',
		},
		pks: {
			table: 'required',
			columns: 'string[]',
			nameExplicit: 'boolean',
		},
		/**
		 * Unique constraints and unique indexes are functionally identical in terms of behavior
		 * We decided to keep both constraints and indexes because when a unique constraint is created
		 * it cannot be removed, whereas an index can be dropped
		 * Removing unique constraints would require recreating the table
		 * Before the beta v1 all unique constraints were created and stored in snapshots as indexes
		 * We do not have sufficient information for upping snapshots to beta v1
		 */
		uniques: {
			table: 'required',
			columns: 'string[]',
			nameExplicit: 'boolean',
		},
		checks: {
			table: 'required',
			value: 'string',
		},
		views: {
			definition: 'string?',
			isExisting: 'boolean',
			error: 'string?',
		},
	});
};

export type SQLiteDDL = ReturnType<typeof createDDL>;

export type SqliteEntities = SQLiteDDL['_']['types'];
export type SqliteEntity = SqliteEntities[keyof SqliteEntities];
export type SqliteDefinition = SQLiteDDL['_']['definition'];
export type SqliteDiffEntities = SQLiteDDL['_']['diffs'];

export type DiffColumn = SqliteDiffEntities['alter']['columns'];
export type DiffEntities = SQLiteDDL['_']['diffs']['alter'];

export type Table = SqliteEntities['tables'];
export type Column = SqliteEntities['columns'];
export type CheckConstraint = SqliteEntities['checks'];
export type Index = SqliteEntities['indexes'];
export type IndexColumn = Index['columns'][number];
export type ForeignKey = SqliteEntities['fks'];
export type PrimaryKey = SqliteEntities['pks'];
export type UniqueConstraint = SqliteEntities['uniques'];
export type View = SqliteEntities['views'];
export type ViewColumn = { view: string; name: string; type: string; notNull: boolean };

export type TableFull = {
	name: string;
	columns: Column[];
	indexes: Index[];
	checks: CheckConstraint[];
	uniques: UniqueConstraint[];
	pk: PrimaryKey | null;
	fks: ForeignKey[];
};

export const tableFromDDL = (name: string, ddl: SQLiteDDL): TableFull => {
	const filter = { table: name } as const;
	const columns = ddl.columns.list(filter);
	const pk = ddl.pks.one(filter);
	const fks = ddl.fks.list(filter);
	const uniques = ddl.uniques.list(filter);
	const checks = ddl.checks.list(filter);
	const indexes = ddl.indexes.list(filter);
	return {
		name,
		columns,
		pk,
		fks,
		uniques,
		checks,
		indexes,
	};
};

export type ConflictTable = {
	type: 'conflict_table';
	table: string;
};

export type TableNoColumns = {
	type: 'table_no_columns';
	table: string;
};

export type ConflictView = {
	type: 'conflict_view';
	view: string;
};

export type ConflictColumn = {
	type: 'conflict_column';
	table: string;
	column: string;
};
export type ConflictIndex = {
	type: 'conflict_index';
	name: string;
};

export type ConflictFK = {
	type: 'conflict_fk';
	name: string;
};
export type ConflictPK = {
	type: 'conflict_pk';
	name: string;
};
export type ConflictUnique = {
	type: 'conflict_unique';
	name: string;
};

export type ConflictCheck = {
	type: 'conflict_check';
	name: string;
};

export type SchemaError =
	| ConflictTable
	| ConflictView
	| ConflictColumn
	| ConflictPK
	| ConflictFK
	| ConflictUnique
	| ConflictCheck
	| ConflictIndex
	| TableNoColumns;

const count = <T>(arr: T[], predicate: (it: T) => boolean) => {
	let count = 0;
	for (const it of arr) {
		if (predicate(it)) count += 1;
	}
	return count;
};

export type InterimColumn = Column & {
	pk: boolean;
	pkName: string | null;
} & { isUnique: boolean; uniqueName: string | null };
export type InterimSchema = {
	tables: Table[];
	columns: InterimColumn[];
	indexes: Index[];
	checks: CheckConstraint[];
	uniques: UniqueConstraint[];
	pks: PrimaryKey[];
	fks: ForeignKey[];
	views: View[];
};

export const fromEntities = (entities: SqliteEntity[]) => {
	const ddl = createDDL();
	for (const it of entities) {
		ddl.entities.push(it);
	}

	return ddl;
};

export const interimToDDL = (schema: InterimSchema): { ddl: SQLiteDDL; errors: SchemaError[] } => {
	const ddl = createDDL();
	const errors: SchemaError[] = [];

	for (const table of schema.tables) {
		if (count(schema.columns, (it) => it.table === table.name) === 0) {
			errors.push({ type: 'table_no_columns', table: table.name });
			continue;
		}
		const res = ddl.tables.push(table);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'conflict_table', table: res.data.name });
		}
	}

	for (const column of schema.columns) {
		const { isUnique: _1, uniqueName: _2, pk: _3, pkName: _4, ...rest } = column;
		const res = ddl.columns.push(rest);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'conflict_column', table: column.table, column: column.name });
		}
	}

	for (const fk of schema.fks) {
		const res = ddl.fks.push(fk);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'conflict_fk', name: fk.name });
		}
	}
	for (const pk of schema.pks) {
		const res = ddl.pks.push(pk);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'conflict_pk', name: pk.name });
		}
	}

	for (const column of schema.columns.filter((it) => it.pk)) {
		const name = column.pkName !== null ? column.pkName : nameForPk(column.table);
		const exists = ddl.pks.one({ table: column.table }) !== null;
		if (exists) continue;

		ddl.pks.push({
			table: column.table,
			name,
			nameExplicit: column.pkName !== null,
			columns: [column.name],
		});
	}

	for (const index of schema.indexes) {
		const { status } = ddl.indexes.push(index, ['name']); // indexes have to have unique names across all schema
		if (status === 'CONFLICT') {
			errors.push({ type: 'conflict_index', name: index.name });
		}
	}

	for (const unique of schema.uniques) {
		const res = ddl.uniques.push(unique);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'conflict_unique', name: unique.name });
		}
	}

	for (const it of schema.columns.filter((it) => it.isUnique)) {
		const u = {
			entityType: 'uniques',
			name: it.uniqueName ?? nameForUnique(it.table, [it.name]),
			columns: [it.name],
			table: it.table,
			nameExplicit: !!it.uniqueName,
		} satisfies UniqueConstraint;

		const res = ddl.uniques.push(u);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'conflict_unique', name: u.name });
		}
	}

	for (const check of schema.checks) {
		const res = ddl.checks.push(check);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'conflict_check', name: res.data.name });
		}
	}

	for (const view of schema.views) {
		const res = ddl.views.push(view);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'conflict_view', view: view.name });
		}
	}

	return { ddl, errors };
};

export function sqliteToRelationsPull(schema: SQLiteDDL): SchemaForPull {
	return Object.values(schema.tables.list()).map((table) => {
		const rawTable = tableFromDDL(table.name, schema);
		return {
			foreignKeys: rawTable.fks,
			uniques: [
				...Object.values(rawTable.uniques).map((unq) => ({
					columns: unq.columns,
				})),
				...Object.values(rawTable.indexes).map((idx) => ({
					columns: idx.columns.map((idxc) => {
						if (!idxc.isExpression && idx.isUnique) {
							return idxc.value;
						}
					}).filter((item) => item !== undefined),
				})),
			],
		};
	});
}
