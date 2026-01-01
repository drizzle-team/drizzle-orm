import {
	any,
	array as zArray,
	boolean,
	coerce,
	enum as enumType,
	literal,
	object,
	record,
	string,
	type TypeOf,
} from 'zod';
import { originUUID } from '../../utils';
import { array, validator } from '../simpleValidator';
import type { SQLiteDDL, SqliteEntity } from './ddl';
import { createDDL } from './ddl';

// ------- V3 --------
const index = object({
	name: string(),
	columns: string().array(),
	where: string().optional(),
	isUnique: boolean(),
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

const compositePK = object({
	columns: string().array(),
	name: string().optional(),
}).strict();

const column = object({
	name: string(),
	type: string(),
	typeSchema: string().optional(), // compatibility with Postgres schema?
	primaryKey: boolean(),
	notNull: boolean(),
	autoincrement: boolean().optional(),
	default: coerce.string().optional(),
	generated: object({
		type: enumType(['stored', 'virtual']),
		as: string(),
	}).optional(),
}).strict();

const uniqueConstraint = object({
	name: string(),
	columns: string().array(),
}).strict();

const checkConstraint = object({
	name: string(),
	value: string(),
}).strict();

const table = object({
	name: string(),
	columns: record(string(), column),
	indexes: record(string(), index),
	foreignKeys: record(string(), fk),
	compositePrimaryKeys: record(string(), compositePK),
	uniqueConstraints: record(string(), uniqueConstraint).default({}),
	checkConstraints: record(string(), checkConstraint).default({}),
}).strict();

export const view = object({
	name: string(),
	columns: record(string(), column),
	definition: string().optional(),
	isExisting: boolean(),
}).strict();

// use main dialect
const dialect = enumType(['sqlite']);

const schemaHash = object({
	id: string(),
	prevIds: zArray(string()),
}).strict();

const schemaHashV5 = object({
	id: string(),
	prevId: string(),
}).strict();

export const schemaInternalV5 = object({
	version: literal('5'),
	dialect: dialect,
	tables: record(string(), table),
	enums: object({}),
	_meta: object({
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
}).strict();

const latestVersion = literal('7');
export const schemaInternalV6 = object({
	version: literal('6'),
	dialect: dialect,
	tables: record(string(), table),
	views: record(string(), view).default({}),
	enums: object({}),
	_meta: object({
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
	internal: any(),
}).strict();

export const schemaV5 = schemaInternalV5.merge(schemaHashV5).strict();
export const schemaV6 = schemaInternalV6.merge(schemaHashV5).strict();
export const schema = schemaInternalV6.merge(schemaHash).strict();
export type SQLiteSchemaV6 = TypeOf<typeof schemaV6>;
export type SQLiteSchema = TypeOf<typeof schema>;

export type Dialect = TypeOf<typeof dialect>;

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

export const schemaSquashed = object({
	version: latestVersion,
	dialect: dialect,
	tables: record(string(), tableSquashed),
	views: record(string(), view),
	enums: record(
		string(),
		object({
			name: string(),
			schema: string(),
			values: string().array(),
		}).strict(),
	),
}).strict();

export const sqliteSchemaV5 = schemaV5;
export const sqliteSchemaV6 = schemaV6;

export const toJsonSnapshot = (
	ddl: SQLiteDDL,
	id: string,
	prevIds: string[],
	renames: string[],
): SqliteSnapshot => {
	return {
		dialect: 'sqlite',
		id,
		prevIds,
		version: '7',
		ddl: ddl.entities.list(),
		renames,
	};
};

const ddl = createDDL();
export const snapshotValidator = validator({
	version: ['7'],
	dialect: ['sqlite'],
	id: 'string',
	prevIds: array<string>((_) => true),
	ddl: array<SqliteEntity>((it) => ddl.entities.validate(it)),
	renames: array<string>((_) => true),
});

export type SqliteSnapshot = typeof snapshotValidator.shape;
export const drySqliteSnapshot = snapshotValidator.strict({
	version: '7',
	dialect: 'sqlite',
	id: originUUID,
	prevIds: [],
	ddl: [],
	renames: [],
});
