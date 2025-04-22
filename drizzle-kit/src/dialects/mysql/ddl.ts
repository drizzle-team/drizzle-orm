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
			columns: 'string[]',
		},
		checks: {
			table: 'required',
			nameExplicit: 'boolean',
			columns: 'string[]',
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

export type Column = MysqlEntities['columns'];
export type Index = MysqlEntities['indexes'];
export type ForeignKey = MysqlEntities['fks'];
export type PrimaryKey = MysqlEntities['pks'];
export type UniqueConstraint = MysqlEntities['uniques'];
export type CheckConstraint = MysqlEntities['checks'];
export type View = MysqlEntities['views'];

// create table users (id integer primary key auto_increment)
