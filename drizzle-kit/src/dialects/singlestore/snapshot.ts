import { randomUUID } from 'crypto';
import { any, array as zArray, boolean, enum as enumType, literal, object, record, string, type TypeOf } from 'zod';
import { originUUID } from '../../utils';
import type { MysqlDDL, MysqlEntity } from '../mysql/ddl';
import { createDDL } from '../mysql/ddl';
import { array, validator } from '../simpleValidator';

// ------- V3 --------
const index = object({
	name: string(),
	columns: string().array(),
	isUnique: boolean(),
	using: enumType(['btree', 'hash']).optional(),
	algorithm: enumType(['default', 'inplace', 'copy']).optional(),
	lock: enumType(['default', 'none', 'shared', 'exclusive']).optional(),
}).strict();

const column = object({
	name: string(),
	type: string(),
	typeSchema: string().optional(), // compatibility with postgres schema?
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

const compositePK = object({
	name: string(),
	columns: string().array(),
}).strict();

const uniqueConstraint = object({
	name: string(),
	columns: string().array(),
}).strict();

const table = object({
	name: string(),
	columns: record(string(), column),
	indexes: record(string(), index),
	compositePrimaryKeys: record(string(), compositePK),
	uniqueConstraints: record(string(), uniqueConstraint).default({}),
}).strict();

// const viewMeta = object({
// 	algorithm: enumType(['undefined', 'merge', 'temptable']),
// 	sqlSecurity: enumType(['definer', 'invoker']),
// 	withCheckOption: enumType(['local', 'cascaded']).optional(),
// }).strict();

/* export const view = object({
	name: string(),
	columns: record(string(), column),
	definition: string().optional(),
	isExisting: boolean(),
}).strict().merge(viewMeta);
type SquasherViewMeta = Omit<TypeOf<typeof viewMeta>, 'definer'>; */

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
const dialect = literal('singlestore');

const schemaHashV1 = object({
	id: string(),
	prevId: string(),
});

const schemaHash = object({
	id: string(),
	prevIds: zArray(string()),
});

export const schemaInternal = object({
	version: literal('1'),
	dialect: dialect,
	tables: record(string(), table),
	/* views: record(string(), view).default({}), */
	_meta: object({
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
	internal: kitInternals,
}).strict();

export const schemaV1 = schemaInternal.merge(schemaHashV1);
export const schema = schemaInternal.merge(schemaHash);

const tableSquashed = object({
	name: string(),
	schema: string().optional(),
	columns: record(string(), column),
	indexes: record(string(), string()),
	compositePrimaryKeys: record(string(), string()),
	uniqueConstraints: record(string(), string()).default({}),
}).strict();

/* const viewSquashed = view.omit({
	algorithm: true,
	sqlSecurity: true,
	withCheckOption: true,
}).extend({ meta: string() }); */

export const schemaSquashed = object({
	version: literal('1'),
	dialect: dialect,
	tables: record(string(), tableSquashed),
	/* views: record(string(), viewSquashed), */
}).strict();

export type Dialect = TypeOf<typeof dialect>;
export type Column = TypeOf<typeof column>;
export type Table = TypeOf<typeof table>;
export type SingleStoreSchema = TypeOf<typeof schema>;
export type SingleStoreSchemaInternal = TypeOf<typeof schemaInternal>;
export type SingleStoreKitInternals = TypeOf<typeof kitInternals>;
export type SingleStoreSchemaSquashed = TypeOf<typeof schemaSquashed>;
export type Index = TypeOf<typeof index>;
export type PrimaryKey = TypeOf<typeof compositePK>;
export type UniqueConstraint = TypeOf<typeof uniqueConstraint>;

export type SchemaV1 = TypeOf<typeof schemaV1>;

const ddl = createDDL();
export const snapshotValidator = validator({
	version: ['2'],
	dialect: ['singlestore'],
	id: 'string',
	prevIds: array<string>((_) => true),
	ddl: array<MysqlEntity>((it) => ddl.entities.validate(it)),
	renames: array<string>((_) => true),
});

export type SingleStoreSnapshot = typeof snapshotValidator.shape;

export const toJsonSnapshot = (ddl: MysqlDDL, prevIds: string[], renames: string[]): SingleStoreSnapshot => {
	return { dialect: 'singlestore', id: randomUUID(), prevIds, version: '2', ddl: ddl.entities.list(), renames };
};

export const drySnapshot = snapshotValidator.strict(
	{
		version: '2',
		dialect: 'singlestore',
		id: originUUID,
		prevIds: [],
		ddl: [],
		renames: [],
	} satisfies SingleStoreSnapshot,
);
