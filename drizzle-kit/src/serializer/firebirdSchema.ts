import { any, boolean, enum as enumType, literal, object, record, string, TypeOf } from 'zod';
import { customMapEntries, mapValues, originUUID } from '../global';

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

const identity = object({
	name: string(),
	type: enumType(['always', 'byDefault']),
	increment: string().optional(),
	minValue: string().optional(),
	maxValue: string().optional(),
	startWith: string().optional(),
	cache: string().optional(),
	cycle: boolean().optional(),
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
	identity: identity.optional(),
}).strict();

const columnSquashed = object({
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
	identity: string().optional(),
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

const dialect = enumType(['firebird']);

const schemaHash = object({
	id: string(),
	prevId: string(),
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
	dialect,
	tables: record(string(), table),
	views: record(string(), view).default({}),
	enums: object({}),
	_meta: object({
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
	internal: kitInternals,
}).strict();

export const schema = schemaInternal.merge(schemaHash).strict();

const tableSquashed = object({
	name: string(),
	columns: record(string(), columnSquashed),
	indexes: record(string(), string()),
	foreignKeys: record(string(), string()),
	compositePrimaryKeys: record(string(), string()),
	uniqueConstraints: record(string(), string()).default({}),
	checkConstraints: record(string(), string()).default({}),
}).strict();

export const schemaSquashed = object({
	version: latestVersion,
	dialect,
	tables: record(string(), tableSquashed),
	views: record(string(), view),
	enums: any(),
}).strict();

export type Dialect = TypeOf<typeof dialect>;
export type Column = TypeOf<typeof column>;
export type Table = TypeOf<typeof table>;
export type FirebirdSchema = TypeOf<typeof schema>;
export type FirebirdSchemaInternal = TypeOf<typeof schemaInternal>;
export type FirebirdSchemaSquashed = TypeOf<typeof schemaSquashed>;
export type FirebirdKitInternals = TypeOf<typeof kitInternals>;
export type Index = TypeOf<typeof index>;
export type ForeignKey = TypeOf<typeof fk>;
export type PrimaryKey = TypeOf<typeof compositePK>;
export type UniqueConstraint = TypeOf<typeof uniqueConstraint>;
export type CheckConstraint = TypeOf<typeof checkConstraint>;
export type Identity = TypeOf<typeof identity>;
export type View = TypeOf<typeof view>;

export const FirebirdSquasher = {
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
	squashIdentity: (seq: Identity) => {
		return `${seq.name};${seq.type};${seq.minValue};${seq.maxValue};${seq.increment};${seq.startWith};${seq.cache};${
			seq.cycle ?? ''
		}`;
	},
	unsquashIdentity: (seq: string): Identity => {
		const splitted = seq.split(';');
		return {
			name: splitted[0],
			type: splitted[1] as 'always' | 'byDefault',
			minValue: splitted[2] !== 'undefined' ? splitted[2] : undefined,
			maxValue: splitted[3] !== 'undefined' ? splitted[3] : undefined,
			increment: splitted[4] !== 'undefined' ? splitted[4] : undefined,
			startWith: splitted[5] !== 'undefined' ? splitted[5] : undefined,
			cache: splitted[6] !== 'undefined' ? splitted[6] : undefined,
			cycle: splitted[7] === 'true',
		};
	},
};

export const squashFirebirdScheme = (
	json: FirebirdSchema,
	action?: 'push' | undefined,
): FirebirdSchemaSquashed => {
	const mappedTables = Object.fromEntries(
		Object.entries(json.tables).map((it) => {
			const squashedIndexes = mapValues(it[1].indexes, (index: Index) => {
				return FirebirdSquasher.squashIdx(index);
			});

			const squashedFKs = customMapEntries<string, ForeignKey>(
				it[1].foreignKeys,
				(key, value) => {
					return action === 'push'
						? [
							FirebirdSquasher.squashPushFK(value),
							FirebirdSquasher.squashPushFK(value),
						]
						: [key, FirebirdSquasher.squashFK(value)];
				},
			);

			const squashedPKs = mapValues(it[1].compositePrimaryKeys, (pk) => {
				return FirebirdSquasher.squashPK(pk);
			});

			const mappedColumns = Object.fromEntries(
				Object.entries(it[1].columns).map((it) => {
					const mappedIdentity = it[1].identity
						? FirebirdSquasher.squashIdentity(it[1].identity)
						: undefined;
					return [
						it[0],
						{
							...it[1],
							identity: mappedIdentity,
						},
					];
				}),
			);

			const squashedUniqueConstraints = mapValues(
				it[1].uniqueConstraints,
				(unq) => {
					return FirebirdSquasher.squashUnique(unq);
				},
			);

			const squashedCheckConstraints = mapValues(
				it[1].checkConstraints,
				(check) => {
					return FirebirdSquasher.squashCheck(check);
				},
			);

			return [
				it[0],
				{
					name: it[1].name,
					columns: mappedColumns,
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

export const dryFirebird = schema.parse({
	version: '6',
	dialect: 'firebird',
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

export const firebirdSchema = schema;
export const FirebirdSchemaSquashed = schemaSquashed;

export const backwardCompatibleFirebirdSchema = schema;
