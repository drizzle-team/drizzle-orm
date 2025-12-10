import { randomUUID } from 'crypto';
import { any, array as zArray, boolean, enum as enumType, literal, object, record, string, type TypeOf } from 'zod';
import { originUUID } from '../../utils';
import { array, validator } from '../simpleValidator';
import type { MysqlDDL, MysqlEntity } from './ddl';
import { createDDL } from './ddl';

// ------- V3 --------
const index = object({
	name: string(),
	columns: string().array(),
	isUnique: boolean(),
	using: enumType(['btree', 'hash']).optional(),
	algorithm: enumType(['default', 'inplace', 'copy']).optional(),
	lock: enumType(['default', 'none', 'shared', 'exclusive']).optional(),
}).strict();

const fk = object({
	name: string(),
	tableFrom: string(),
	columnsFrom: string().array(),
	tableTo: string(),
	columnsTo: string().array(),
	onUpdate: string().optional(),
	onDelete: string().optional(),
}).strict();

const column = object({
	name: string(),
	type: string(),
	primaryKey: boolean(),
	notNull: boolean(),
	autoincrement: boolean().optional(),
	default: any().optional(),
	onUpdate: any().optional(),
	generated: object({
		type: enumType(['stored', 'virtual']),
		as: string(),
	}).optional(),
}).strict();

const tableV3 = object({
	name: string(),
	columns: record(string(), column),
	indexes: record(string(), index),
	foreignKeys: record(string(), fk),
}).strict();

const compositePK = object({
	name: string(),
	columns: string().array(),
}).strict();

const uniqueConstraint = object({
	name: string(),
	columns: string().array(),
}).strict();

const checkConstraint = object({
	name: string(),
	value: string(),
}).strict();

const tableV4 = object({
	name: string(),
	schema: string().optional(),
	columns: record(string(), column),
	indexes: record(string(), index),
	foreignKeys: record(string(), fk),
}).strict();

const table = object({
	name: string(),
	columns: record(string(), column),
	indexes: record(string(), index),
	foreignKeys: record(string(), fk),
	compositePrimaryKeys: record(string(), compositePK),
	uniqueConstraints: record(string(), uniqueConstraint).default({}),
	checkConstraint: record(string(), checkConstraint).default({}),
}).strict();

const viewMeta = object({
	algorithm: enumType(['undefined', 'merge', 'temptable']),
	sqlSecurity: enumType(['definer', 'invoker']),
	withCheckOption: enumType(['local', 'cascaded']).optional(),
}).strict();

export const view = object({
	name: string(),
	columns: record(string(), column),
	definition: string().optional(),
	isExisting: boolean(),
}).strict().merge(viewMeta);
// type SquasherViewMeta = Omit<TypeOf<typeof viewMeta>, 'definer'>;

export const kitInternals = object({
	tables: record(
		string(),
		object({
			columns: record(
				string(),
				object({ isDefaultAnExpression: boolean().optional() }).optional(),
			),
		}).optional(),
	).optional(),
	indexes: record(
		string(),
		object({
			columns: record(
				string(),
				object({ isExpression: boolean().optional() }).optional(),
			),
		}).optional(),
	).optional(),
}).optional();

// use main dialect
const dialect = literal('mysql');

const schemaHash = object({
	id: string(),
	prevIds: zArray(string()),
});

const schemaHashV6 = object({
	id: string(),
	prevId: string(),
});

export const schemaInternalV3 = object({
	version: literal('3'),
	dialect: dialect,
	tables: record(string(), tableV3),
}).strict();

export const schemaInternalV4 = object({
	version: literal('4'),
	dialect: dialect,
	tables: record(string(), tableV4),
	schemas: record(string(), string()),
}).strict();

export const schemaInternalV5 = object({
	version: literal('5'),
	dialect: dialect,
	tables: record(string(), table),
	schemas: record(string(), string()),
	_meta: object({
		schemas: record(string(), string()),
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
	internal: kitInternals,
}).strict();

export const schemaInternal = object({
	version: literal('5'),
	dialect: dialect,
	tables: record(string(), table),
	views: record(string(), view).default({}),
	_meta: object({
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
	internal: kitInternals,
}).strict();

export const schemaV3 = schemaInternalV3.merge(schemaHash);
export const schemaV4 = schemaInternalV4.merge(schemaHash);
export const schemaV5 = schemaInternalV5.merge(schemaHash);
export const schemaV6 = schemaInternal.merge(schemaHashV6);
export const schema = schemaInternal.merge(schemaHash);

export type Table = TypeOf<typeof table>;
export type Column = TypeOf<typeof column>;
export type SchemaV4 = TypeOf<typeof schemaV4>;
export type SchemaV5 = TypeOf<typeof schemaV5>;
export type SchemaV6 = TypeOf<typeof schemaV6>;
export type Schema = TypeOf<typeof schema>;

const tableSquashedV4 = object({
	name: string(),
	schema: string().optional(),
	columns: record(string(), column),
	indexes: record(string(), string()),
	foreignKeys: record(string(), string()),
}).strict();

const tableSquashed = object({
	name: string(),
	schema: string().optional(),
	columns: record(string(), column),
	indexes: record(string(), string()),
	foreignKeys: record(string(), string()),
	compositePrimaryKeys: record(string(), string()),
	uniqueConstraints: record(string(), string()).default({}),
	checkConstraints: record(string(), string()).default({}),
}).strict();

const viewSquashed = view.omit({
	algorithm: true,
	sqlSecurity: true,
	withCheckOption: true,
}).extend({ meta: string() });

export const schemaSquashed = object({
	version: literal('5'),
	dialect: dialect,
	tables: record(string(), tableSquashed),
	views: record(string(), viewSquashed),
}).strict();

export const schemaSquashedV4 = object({
	version: literal('4'),
	dialect: dialect,
	tables: record(string(), tableSquashedV4),
	schemas: record(string(), string()),
}).strict();

export const mysqlSchema = schema;
export const mysqlSchemaV3 = schemaV3;
export const mysqlSchemaV4 = schemaV4;
export const mysqlSchemaV5 = schemaV5;
export const mysqlSchemaSquashed = schemaSquashed;
export type MysqlSchemaV6 = SchemaV6;
export type MysqlSchema = Schema;

const ddl = createDDL();
export const snapshotValidator = validator({
	version: ['6'],
	dialect: ['mysql'],
	id: 'string',
	prevIds: array<string>((_) => true),
	ddl: array<MysqlEntity>((it) => ddl.entities.validate(it)),
	renames: array<string>((_) => true),
});

export type MysqlSnapshot = typeof snapshotValidator.shape;

export const toJsonSnapshot = (ddl: MysqlDDL, prevIds: string[], renames: string[]): MysqlSnapshot => {
	return { dialect: 'mysql', id: randomUUID(), prevIds, version: '6', ddl: ddl.entities.list(), renames };
};

export const drySnapshot = snapshotValidator.strict(
	{
		version: '6',
		dialect: 'mysql',
		id: originUUID,
		prevIds: [],
		ddl: [],
		renames: [],
	} satisfies MysqlSnapshot,
);
