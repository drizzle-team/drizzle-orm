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
				expression: 'boolean',
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
			nameExplicit: 'boolean',
			columns: [{
				value: 'string',
				isExpression: 'boolean',
			}],
			unique: 'boolean',
			using: ['btree', 'hash', null],
			algorithm: ['default', 'inplace', 'copy', null],
			lock: ['default', 'none', 'shared', 'exclusive', null],
		},
		uniques: {
			table: 'required',
			nameExplicit: 'boolean',
			columns: [{ value: 'string', expression: 'boolean' }],
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
			existing: 'boolean',
		},
	});
};

const ddl = createDDL();
ddl.tables.insert({ name: 'users' });
ddl.columns.insert({
	table: 'users',
	name: 'id',
	type: 'integer',
	notNull: false,
	autoIncrement: true,
	default: null,
	generated: null,
	onUpdateNow: false,
});
ddl.pks.insert({
	table: 'users',
	name: 'users_pkey',
	nameExplicit: false,
	columns: ['id'],
});

export type MysqlDDL = ReturnType<typeof createDDL>;

export type MysqlEntities = MysqlDDL['_']['types'];
export type MysqlEntity = MysqlEntities[keyof MysqlEntities];
export type DiffEntities = MysqlDDL['_']['diffs']['alter'];

export type Table = MysqlEntities['tables'];
export type Column = MysqlEntities['columns'];
export type Index = MysqlEntities['indexes'];
export type ForeignKey = MysqlEntities['fks'];
export type PrimaryKey = MysqlEntities['pks'];
export type UniqueConstraint = MysqlEntities['uniques'];
export type CheckConstraint = MysqlEntities['checks'];
export type View = MysqlEntities['views'];

export type TableFull = {
	name: string;
	columns: Column[];
	pk: PrimaryKey | null;
	fks: ForeignKey[];
	uniques: UniqueConstraint[];
	checks: CheckConstraint[];
	indexes: Index[];
};

export const fullTableFromDDL = (table: Table, ddl: MysqlDDL): TableFull => {
	const filter = { table: table.name };
	const columns = ddl.columns.list(filter);
	const pk = ddl.pks.one(filter);
	const fks = ddl.fks.list(filter);
	const uniques = ddl.uniques.list(filter);
	const checks = ddl.checks.list(filter);
	const indexes = ddl.indexes.list(filter);
	return {
		name: table.name,
		columns,
		pk,
		fks,
		uniques,
		checks,
		indexes,
	};
};
