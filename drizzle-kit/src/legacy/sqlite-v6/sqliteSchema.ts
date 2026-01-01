import type { TypeOf } from 'zod';
import { any, boolean, enum as enumType, literal, object, record, string, union } from 'zod';
import { customMapEntries, mapValues, originUUID } from '../global';

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
	primaryKey: boolean(),
	notNull: boolean(),
	autoincrement: boolean().optional(),
	default: any().optional(),
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
	prevId: string(),
}).strict();

export const schemaInternalV3 = object({
	version: literal('3'),
	dialect: dialect,
	tables: record(string(), tableV3),
	enums: object({}),
}).strict();

export const schemaInternalV4 = object({
	version: literal('4'),
	dialect: dialect,
	tables: record(string(), table),
	views: record(string(), view).default({}),
	enums: object({}),
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

export const kitInternals = object({
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

const latestVersion = literal('6');
export const schemaInternal = object({
	version: latestVersion,
	dialect: dialect,
	tables: record(string(), table),
	views: record(string(), view).default({}),
	enums: object({}),
	_meta: object({
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
	internal: kitInternals,
}).strict();

export const schemaV3 = schemaInternalV3.merge(schemaHash).strict();
export const schemaV4 = schemaInternalV4.merge(schemaHash).strict();
export const schemaV5 = schemaInternalV5.merge(schemaHash).strict();
export const schema = schemaInternal.merge(schemaHash).strict();

const tableSquashed = object({
	name: string(),
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
	enums: any(),
}).strict();

export type Dialect = TypeOf<typeof dialect>;
export type Column = TypeOf<typeof column>;
export type Table = TypeOf<typeof table>;
export type SQLiteSchema = TypeOf<typeof schema>;
export type SQLiteSchemaV3 = TypeOf<typeof schemaV3>;
export type SQLiteSchemaV4 = TypeOf<typeof schemaV4>;
export type SQLiteSchemaInternal = TypeOf<typeof schemaInternal>;
export type SQLiteSchemaSquashed = TypeOf<typeof schemaSquashed>;
export type SQLiteKitInternals = TypeOf<typeof kitInternals>;
export type Index = TypeOf<typeof index>;
export type ForeignKey = TypeOf<typeof fk>;
export type PrimaryKey = TypeOf<typeof compositePK>;
export type UniqueConstraint = TypeOf<typeof uniqueConstraint>;
export type CheckConstraint = TypeOf<typeof checkConstraint>;
export type View = TypeOf<typeof view>;

export const SQLiteSquasher = {
	squashIdx: (idx: Index) => {
		index.parse(idx);
		return `${idx.name};${idx.columns.join(',')};${idx.isUnique};${idx.where ?? ''}`;
	},
	unsquashIdx: (input: string): Index => {
		const [name, columnsString, isUnique, where] = input.split(';');

		const result: Index = index.parse({
			name,
			columns: columnsString.split(','),
			isUnique: isUnique === 'true',
			where: where ?? undefined,
		});
		return result;
	},
	squashUnique: (unq: UniqueConstraint) => {
		return `${unq.name};${unq.columns.join(',')}`;
	},
	unsquashUnique: (unq: string): UniqueConstraint => {
		const [name, columns] = unq.split(';');
		return { name, columns: columns.split(',') };
	},
	squashFK: (fk: ForeignKey) => {
		return `${fk.name};${fk.tableFrom};${fk.columnsFrom.join(',')};${fk.tableTo};${fk.columnsTo.join(',')};${
			fk.onUpdate ?? ''
		};${fk.onDelete ?? ''}`;
	},
	unsquashFK: (input: string): ForeignKey => {
		const [
			name,
			tableFrom,
			columnsFromStr,
			tableTo,
			columnsToStr,
			onUpdate,
			onDelete,
		] = input.split(';');

		const result: ForeignKey = fk.parse({
			name,
			tableFrom,
			columnsFrom: columnsFromStr.split(','),
			tableTo,
			columnsTo: columnsToStr.split(','),
			onUpdate,
			onDelete,
		});
		return result;
	},
	squashPushFK: (fk: ForeignKey) => {
		return `${fk.tableFrom};${fk.columnsFrom.join(',')};${fk.tableTo};${fk.columnsTo.join(',')};${fk.onUpdate ?? ''};${
			fk.onDelete ?? ''
		}`;
	},
	unsquashPushFK: (input: string): ForeignKey => {
		const [
			tableFrom,
			columnsFromStr,
			tableTo,
			columnsToStr,
			onUpdate,
			onDelete,
		] = input.split(';');

		const result: ForeignKey = fk.parse({
			name: '',
			tableFrom,
			columnsFrom: columnsFromStr.split(','),
			tableTo,
			columnsTo: columnsToStr.split(','),
			onUpdate,
			onDelete,
		});
		return result;
	},
	squashPK: (pk: PrimaryKey) => {
		return pk.columns.join(',');
	},
	unsquashPK: (pk: string) => {
		return pk.split(',');
	},
	squashCheck: (check: CheckConstraint) => {
		return `${check.name};${check.value}`;
	},
	unsquashCheck: (input: string): CheckConstraint => {
		const [
			name,
			value,
		] = input.split(';');

		return { name, value };
	},
};

export const squashSqliteScheme = (
	json: SQLiteSchema | SQLiteSchemaV4,
	action?: 'push' | undefined,
): SQLiteSchemaSquashed => {
	const mappedTables = Object.fromEntries(
		Object.entries(json.tables).map((it) => {
			const squashedIndexes = mapValues(it[1].indexes, (index: Index) => {
				return SQLiteSquasher.squashIdx(index);
			});

			const squashedFKs = customMapEntries<string, ForeignKey>(
				it[1].foreignKeys,
				(key, value) => {
					return action === 'push'
						? [
							SQLiteSquasher.squashPushFK(value),
							SQLiteSquasher.squashPushFK(value),
						]
						: [key, SQLiteSquasher.squashFK(value)];
				},
			);

			const squashedPKs = mapValues(it[1].compositePrimaryKeys, (pk) => {
				return SQLiteSquasher.squashPK(pk);
			});

			const squashedUniqueConstraints = mapValues(
				it[1].uniqueConstraints,
				(unq) => {
					return SQLiteSquasher.squashUnique(unq);
				},
			);

			const squashedCheckConstraints = mapValues(
				it[1].checkConstraints,
				(check) => {
					return SQLiteSquasher.squashCheck(check);
				},
			);

			return [
				it[0],
				{
					name: it[1].name,
					columns: it[1].columns,
					indexes: squashedIndexes,
					foreignKeys: squashedFKs,
					compositePrimaryKeys: squashedPKs,
					uniqueConstraints: squashedUniqueConstraints,
					checkConstraints: squashedCheckConstraints,
				},
			];
		}),
	);

	return {
		version: '6',
		dialect: json.dialect,
		tables: mappedTables,
		views: json.views,
		enums: json.enums,
	};
};

export const drySQLite = schema.parse({
	version: '6',
	dialect: 'sqlite',
	id: originUUID,
	prevId: '',
	tables: {},
	views: {},
	enums: {},
	_meta: {
		tables: {},
		columns: {},
	},
});

export const sqliteSchemaV3 = schemaV3;
export const sqliteSchemaV4 = schemaV4;
export const sqliteSchemaV5 = schemaV5;
export const sqliteSchema = schema;
export const SQLiteSchemaSquashed = schemaSquashed;

export const backwardCompatibleSqliteSchema = union([sqliteSchemaV5, schema]);
