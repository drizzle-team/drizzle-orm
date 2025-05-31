import { randomUUID } from 'crypto';
import { any, boolean, enum as enumType, literal, object, record, string, TypeOf } from 'zod';
import { originUUID } from '../../utils';
import { array, validator } from '../simpleValidator';
import { createDDL, MssqlDDL, MssqlEntity } from './ddl';

const index = object({
	name: string(),
	columns: string().array(),
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

const column = object({
	name: string(),
	type: string(),
	primaryKey: boolean(),
	notNull: boolean(),
	default: any().optional(),
	generated: object({
		type: enumType(['stored', 'virtual']), // TODO persisted
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
	checkConstraint: record(string(), checkConstraint).default({}),
}).strict();

const viewMeta = object({
	checkOption: boolean().optional(),
	encryption: boolean().optional(),
	schemaBinding: boolean().optional(),
	viewMetadata: boolean().optional(),
}).strict();

export const view = object({
	name: string(),
	columns: record(string(), column),
	definition: string().optional(),
	isExisting: boolean(),
}).strict().merge(viewMeta);

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
const dialect = literal('mssql');

const schemaHash = object({
	id: string(),
	prevId: string(),
});

export const schemaInternal = object({
	version: literal('1'),
	dialect: dialect,
	tables: record(string(), table),
	views: record(string(), view).default({}),
	_meta: object({
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
	internal: kitInternals,
}).strict();

export const schema = schemaInternal.merge(schemaHash);

export type Table = TypeOf<typeof table>;
export type Column = TypeOf<typeof column>;

const ddl = createDDL();
export const snapshotValidator = validator({
	version: ['1'],
	dialect: ['mssql'],
	id: 'string',
	prevId: 'string',
	ddl: array<MssqlEntity>((it) => ddl.entities.validate(it)),
	renames: array<string>((_) => true),
});

export type MssqlSnapshot = typeof snapshotValidator.shape;

export const toJsonSnapshot = (ddl: MssqlDDL, prevId: string, renames: string[]): MssqlSnapshot => {
	return { dialect: 'mssql', id: randomUUID(), prevId, version: '1', ddl: ddl.entities.list(), renames };
};

export const drySnapshot = snapshotValidator.strict(
	{
		version: '1',
		dialect: 'mssql',
		id: originUUID,
		prevId: '',
		ddl: [],
		renames: [],
	} satisfies MssqlSnapshot,
);
