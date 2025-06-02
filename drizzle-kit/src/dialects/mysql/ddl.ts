import { create } from '../dialect';

export const createDDL = () => {
	return create({
		tables: {},
		columns: {
			table: 'required',
			type: 'string',
			notNull: 'boolean',
			autoIncrement: 'boolean',
			default: {
				value: 'string',
				type: ['string', 'number', 'boolean', 'bigint', 'json', 'text', 'unknown'],
			},
			onUpdateNow: 'boolean',
			generated: {
				type: ['stored', 'virtual'],
				as: 'string',
			},
		},
		pks: {
			table: 'required',
			nameExplicit: 'boolean',
			columns: 'string[]',
		},
		fks: {
			table: 'required',
			columns: 'string[]',
			tableTo: 'string',
			columnsTo: 'string[]',
			onUpdate: ['NO ACTION', 'RESTRICT', 'SET NULL', 'CASCADE', 'SET DEFAULT', null],
			onDelete: ['NO ACTION', 'RESTRICT', 'SET NULL', 'CASCADE', 'SET DEFAULT', null],
		},
		indexes: {
			table: 'required',
			columns: [{
				value: 'string',
				isExpression: 'boolean',
			}],
			isUnique: 'boolean',
			using: ['btree', 'hash', null],
			algorithm: ['default', 'inplace', 'copy', null],
			lock: ['default', 'none', 'shared', 'exclusive', null],
		},
		checks: {
			table: 'required',
			nameExplicit: 'boolean',
			value: 'string',
		},
		views: {
			definition: 'string',
			algorithm: ['undefined', 'merge', 'temptable'],
			sqlSecurity: ['definer', 'invoker'],
			withCheckOption: ['local', 'cascaded', null],
		},
	});
};

export type MysqlDDL = ReturnType<typeof createDDL>;

export type MysqlEntities = MysqlDDL['_']['types'];
export type MysqlEntity = MysqlEntities[keyof MysqlEntities];
export type DiffEntities = MysqlDDL['_']['diffs']['alter'];

export type Table = MysqlEntities['tables'];
export type Column = MysqlEntities['columns'];
export type Index = MysqlEntities['indexes'];
export type ForeignKey = MysqlEntities['fks'];
export type PrimaryKey = MysqlEntities['pks'];
export type CheckConstraint = MysqlEntities['checks'];
export type View = MysqlEntities['views'];

export type InterimColumn = Column & { isPK: boolean; isUnique: boolean };
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
};

export const interimToDDL = (interim: InterimSchema): { ddl: MysqlDDL; errors: SchemaError[] } => {
	const errors = [] as SchemaError[];
	const ddl = createDDL();
	for (const table of interim.tables) {
		const res = ddl.tables.push(table);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'table_name_conflict', name: table.name });
		}
	}

	for (const column of interim.columns) {
		const { isPK, isUnique, ...rest } = column;
		const res = ddl.columns.push(rest);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'column_name_conflict', table: column.table, name: column.name });
		}
	}

	for (const pk of interim.pks) {
		const res = ddl.pks.push(pk);
		if (res.status === 'CONFLICT') {
			throw new Error(`PK conflict: ${JSON.stringify(pk)}`);
		}
	}

	for (const column of interim.columns.filter((it) => it.isPK)) {
		const res = ddl.pks.push({
			table: column.table,
			name: 'PRIMARY', // database default
			nameExplicit: false,
			columns: [column.name],
		});

		if (res.status === 'CONFLICT') {
			throw new Error(`PK conflict: ${JSON.stringify(column)}`);
		}
	}

	for (const column of interim.columns.filter((it) => it.isUnique)) {
		const name = `${column.name}_unique`;
		ddl.indexes.push({
			table: column.table,
			name,
			columns: [{ value: column.name, isExpression: false }],
			isUnique: true,
			using: null,
			algorithm: null,
			lock: null,
		});
	}

	for (const index of interim.indexes) {
		const res = ddl.indexes.push(index);
		if (res.status === 'CONFLICT') {
			throw new Error(`Index conflict: ${JSON.stringify(index)}`);
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

	return { ddl, errors };
};
