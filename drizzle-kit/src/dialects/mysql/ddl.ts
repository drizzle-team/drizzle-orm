import type { SchemaForPull } from '../../cli/commands/pull-common';
import type { Alter } from '../dialect';
import { create } from '../dialect';
import { nameForUnique } from './grammar';

export const createDDL = () =>
	create({
		tables: { name: 'string' },
		columns: {
			table: 'string',
			name: 'string',
			type: 'string',
			notNull: 'boolean',
			autoIncrement: 'boolean',
			default: 'string?',
			onUpdateNow: 'boolean',
			onUpdateNowFsp: 'number?',
			charSet: 'string?',
			collation: 'string?',
			generated: {
				type: ['stored', 'virtual'],
				as: 'string',
			},
		},
		pks: {
			table: 'string',
			name: 'string',
			columns: 'string[]',
		},
		fks: {
			table: 'string',
			name: 'string',
			columns: 'string[]',
			tableTo: 'string',
			columnsTo: 'string[]',
			onUpdate: ['NO ACTION', 'RESTRICT', 'SET NULL', 'CASCADE', 'SET DEFAULT', null],
			onDelete: ['NO ACTION', 'RESTRICT', 'SET NULL', 'CASCADE', 'SET DEFAULT', null],
			nameExplicit: 'boolean',
		},
		indexes: {
			table: 'string',
			name: 'string',
			columns: [{
				value: 'string',
				isExpression: 'boolean',
			}],
			isUnique: 'boolean',
			using: ['btree', 'hash', null],
			algorithm: ['default', 'inplace', 'copy', null],
			lock: ['default', 'none', 'shared', 'exclusive', null],
			nameExplicit: 'boolean', // needed because uniques name can be not specified
		},
		checks: {
			table: 'string',
			name: 'string',
			value: 'string',
		},
		views: {
			name: 'string',
			definition: 'string',
			algorithm: ['undefined', 'merge', 'temptable'],
			sqlSecurity: ['definer', 'invoker'],
			withCheckOption: ['local', 'cascaded', null],
		},
	}, {
		identity: {
			tables: (r) => JSON.stringify([r.name]),
			columns: (r) => JSON.stringify([r.table, r.name]),
			pks: (r) => JSON.stringify([r.table, r.name]),
			fks: (r) => JSON.stringify([r.table, r.name]),
			indexes: (r) => JSON.stringify([r.table, r.name]),
			checks: (r) => JSON.stringify([r.table, r.name]),
			views: (r) => JSON.stringify([r.name]),
		},
		edges: {
			columns: [{ to: 'tables', map: { name: 'table' } }],
			checks: [{ to: 'tables', map: { name: 'table' } }],
			pks: [
				{ to: 'tables', map: { name: 'table' } },
				{ to: 'columns', map: { table: 'table', name: { list: 'columns' } } },
			],
			indexes: [
				{ to: 'tables', map: { name: 'table' } },
				{ to: 'columns', map: { table: 'table', name: { list: 'columns', pick: 'value', skipWhen: 'isExpression' } } },
			],
			fks: [
				{ to: 'tables', map: { name: 'table' } },
				{ to: 'columns', map: { table: 'table', name: { list: 'columns' } } },
				{ to: 'tables', map: { name: 'tableTo' } },
				{ to: 'columns', map: { table: 'tableTo', name: { list: 'columnsTo' } } },
			],
		},
	});

export type MysqlDDL = ReturnType<typeof createDDL>;

export type MysqlEntities = NonNullable<MysqlDDL['$entities']>;
export type MysqlEntity = MysqlEntities[keyof MysqlEntities];
export type DiffEntities = { [K in keyof MysqlEntities]: Alter<MysqlEntities[K]> };

export type Table = MysqlEntities['tables'];
export type Column = MysqlEntities['columns'];
export type Index = MysqlEntities['indexes'];
export type ForeignKey = MysqlEntities['fks'];
export type PrimaryKey = MysqlEntities['pks'];
export type CheckConstraint = MysqlEntities['checks'];
export type View = MysqlEntities['views'];

export type InterimColumn = Column & { isPK: boolean; isUnique: boolean; uniqueName: string | null };
export type ViewColumn = {
	view: string;
	name: string;
	type: string;
	notNull: boolean;
};

export type InterimSchema = {
	tables: Table[];
	columns: InterimColumn[];
	pks: PrimaryKey[];
	fks: ForeignKey[];
	indexes: Index[];
	checks: CheckConstraint[];
	views: View[];
	viewColumns: ViewColumn[];
};

export type TableFull = {
	name: string;
	columns: Column[];
	pk: PrimaryKey | null;
	fks: ForeignKey[];
	checks: CheckConstraint[];
	indexes: Index[];
};

export const fullTableFromDDL = (table: Table, ddl: MysqlDDL): TableFull => {
	const filter = { table: table.name };
	const columns = ddl.columns.list(filter);
	const pk = ddl.pks.one(filter);
	const fks = ddl.fks.list(filter);
	const checks = ddl.checks.list(filter);
	const indexes = ddl.indexes.list(filter);
	return {
		name: table.name,
		columns,
		pk,
		fks,
		checks,
		indexes,
	};
};

export type SchemaError = {
	type: 'table_name_conflict';
	name: string;
} | {
	type: 'column_name_conflict';
	table: string;
	name: string;
} | {
	type: 'column_unsupported_unique';
	table: string;
	columns: string[];
} | {
	type: 'column_unsupported_default_on_autoincrement';
	table: string;
	column: string;
};

export const interimToDDL = (interim: InterimSchema): { ddl: MysqlDDL; errors: SchemaError[] } => {
	const errors = [] as SchemaError[];
	const ddl = createDDL();
	const resrtictedUniqueFor = [
		'blob',
		'tinyblob',
		'mediumblob',
		'longblob',
		'text',
		'tinytext',
		'mediumtext',
		'longtext',
	];

	for (const table of interim.tables) {
		const res = ddl.tables.push(table);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'table_name_conflict', name: table.name });
		}
	}

	for (const column of interim.columns) {
		const { isPK: _1, isUnique: _2, uniqueName: _3, ...rest } = column;
		const res = ddl.columns.push(rest);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'column_name_conflict', table: column.table, name: column.name });
		}

		if ((column.type.startsWith('serial') || column.autoIncrement) && column.default !== null) {
			errors.push({ type: 'column_unsupported_default_on_autoincrement', table: column.table, column: column.name });
		}
	}

	for (const pk of interim.pks) {
		const res = ddl.pks.push({ table: pk.table, name: 'PRIMARY', columns: pk.columns });
		if (res.status === 'CONFLICT') {
			throw new Error(`PK conflict: ${JSON.stringify(pk)}`);
		}
	}

	for (const column of interim.columns.filter((it) => it.isPK)) {
		const exists = ddl.pks.one({
			table: column.table,
			name: 'PRIMARY', // database default
		}) !== null;
		if (exists) continue;

		ddl.pks.push({
			table: column.table,
			name: 'PRIMARY', // database default
			columns: [column.name],
		});
	}

	for (const column of interim.columns.filter((it) => it.isUnique)) {
		if (resrtictedUniqueFor.some((rc) => column.type.startsWith(rc))) {
			errors.push({ type: 'column_unsupported_unique', columns: [column.name], table: column.table });
		}

		const name = column.uniqueName ?? nameForUnique(column.table, [column.name]);
		const res = ddl.indexes.push({
			table: column.table,
			name,
			columns: [{ value: column.name, isExpression: false }],
			isUnique: true,
			using: null,
			algorithm: null,
			lock: null,
			nameExplicit: !!column.uniqueName,
		});

		if (res.status === 'CONFLICT') {
			throw new Error(`Index unique conflict: ${name}`);
		}
	}

	for (const index of interim.indexes) {
		const res = ddl.indexes.push(index);
		if (res.status === 'CONFLICT') {
			throw new Error(`Index conflict: ${JSON.stringify(index)}`);
		}
	}
	for (const index of interim.indexes.filter((i) => i.isUnique)) {
		const conflictColumns = index.columns.filter((col) => {
			if (col.isExpression) return false;

			const column = ddl.columns.one({ table: index.table, name: col.value });

			return resrtictedUniqueFor.some(
				(restrictedType) => column?.type.startsWith(restrictedType),
			);
		});

		if (conflictColumns.length > 0) {
			errors.push({
				type: 'column_unsupported_unique',
				columns: conflictColumns.map((it) => it.value),
				table: index.table,
			});
		}
	}

	for (const fk of interim.fks) {
		const res = ddl.fks.push(fk);
		if (res.status === 'CONFLICT') {
			throw new Error(`FK conflict: ${JSON.stringify(fk)}`);
		}
	}

	for (const check of interim.checks) {
		const res = ddl.checks.push(check);
		if (res.status === 'CONFLICT') {
			throw new Error(`Check constraint conflict: ${JSON.stringify(check)}`);
		}
	}

	for (const view of interim.views) {
		const res = ddl.views.push(view);
		if (res.status === 'CONFLICT') {
			throw new Error(`View conflict: ${JSON.stringify(view)}`);
		}
	}

	// TODO: add to other dialects, though potentially we should check on push
	for (const it of ddl.entities.list()) {
		if (!ddl.entities.validate(it)) {
			throw new Error(`Invalid entity: ${JSON.stringify(it)}`);
		}
	}

	return { ddl, errors };
};

export const tableFromDDL = (
	table: MysqlEntities['tables'],
	ddl: MysqlDDL,
) => {
	const filter = { table: table.name } as const;
	const columns = ddl.columns.list(filter);
	const pk = ddl.pks.one(filter);
	const fks = ddl.fks.list(filter);
	const checks = ddl.checks.list(filter);
	const indexes = ddl.indexes.list(filter);

	return {
		...table,
		columns,
		pk,
		fks,
		checks,
		indexes,
	};
};

export function mysqlToRelationsPull(schema: MysqlDDL): SchemaForPull {
	return Object.values(schema.tables.list()).map((table) => {
		const rawTable = tableFromDDL(table, schema);
		return {
			foreignKeys: rawTable.fks,
			columns: rawTable.columns.map((it) => ({ name: it.name })),
			uniques: Object.values(rawTable.indexes).map((idx) => ({
				columns: idx.columns.map((idxc) => {
					if (!idxc.isExpression && idx.isUnique) {
						return idxc.value;
					}
				}).filter((item) => item !== undefined),
			})),
		};
	});
}
