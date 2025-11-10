import type { TypeOf } from 'zod';
import { any, boolean, enum as enumType, literal, object, record, string, union } from 'zod';
import { mapValues, originUUID } from '../global';

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
		type: enumType(['stored', 'virtual', 'persisted']),
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
type SquasherViewMeta = Omit<TypeOf<typeof viewMeta>, 'definer'>;

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
export const schema = schemaInternal.merge(schemaHash);

const tableSquashedV4 = object({
	name: string(),
	schema: string().optional(),
	columns: record(string(), column),
	indexes: record(string(), string()),
	foreignKeys: record(string(), string()),
}).strict();

const tableSquashed = object({
	name: string(),
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

export type Dialect = TypeOf<typeof dialect>;
export type Column = TypeOf<typeof column>;
export type Table = TypeOf<typeof table>;
export type TableV4 = TypeOf<typeof tableV4>;
export type MySqlSchema = TypeOf<typeof schema>;
export type MySqlSchemaV3 = TypeOf<typeof schemaV3>;
export type MySqlSchemaV4 = TypeOf<typeof schemaV4>;
export type MySqlSchemaV5 = TypeOf<typeof schemaV5>;
export type MySqlSchemaInternal = TypeOf<typeof schemaInternal>;
export type MySqlKitInternals = TypeOf<typeof kitInternals>;
export type MySqlSchemaSquashed = TypeOf<typeof schemaSquashed>;
export type MySqlSchemaSquashedV4 = TypeOf<typeof schemaSquashedV4>;
export type Index = TypeOf<typeof index>;
export type ForeignKey = TypeOf<typeof fk>;
export type PrimaryKey = TypeOf<typeof compositePK>;
export type UniqueConstraint = TypeOf<typeof uniqueConstraint>;
export type CheckConstraint = TypeOf<typeof checkConstraint>;
export type View = TypeOf<typeof view>;
export type ViewSquashed = TypeOf<typeof viewSquashed>;

export const MySqlSquasher = {
	squashIdx: (idx: Index) => {
		index.parse(idx);
		return `${idx.name};${idx.columns.join(',')};${idx.isUnique};${idx.using ?? ''};${idx.algorithm ?? ''};${
			idx.lock ?? ''
		}`;
	},
	unsquashIdx: (input: string): Index => {
		const [name, columnsString, isUnique, using, algorithm, lock] = input.split(';');
		const destructed = {
			name,
			columns: columnsString.split(','),
			isUnique: isUnique === 'true',
			using: using ? using : undefined,
			algorithm: algorithm ? algorithm : undefined,
			lock: lock ? lock : undefined,
		};
		return index.parse(destructed);
	},
	squashPK: (pk: PrimaryKey) => {
		return `${pk.name};${pk.columns.join(',')}`;
	},
	unsquashPK: (pk: string): PrimaryKey => {
		const splitted = pk.split(';');
		return { name: splitted[0], columns: splitted[1].split(',') };
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
	squashCheck: (input: CheckConstraint): string => {
		return `${input.name};${input.value}`;
	},
	unsquashCheck: (input: string): CheckConstraint => {
		const [name, value] = input.split(';');

		return { name, value };
	},
	squashView: (view: View): string => {
		return `${view.algorithm};${view.sqlSecurity};${view.withCheckOption}`;
	},
	unsquashView: (meta: string): SquasherViewMeta => {
		const [algorithm, sqlSecurity, withCheckOption] = meta.split(';');
		const toReturn = {
			algorithm: algorithm,
			sqlSecurity: sqlSecurity,
			withCheckOption: withCheckOption !== 'undefined' ? withCheckOption : undefined,
		};

		return viewMeta.parse(toReturn);
	},
};

export const squashMysqlSchemeV4 = (
	json: MySqlSchemaV4,
): MySqlSchemaSquashedV4 => {
	const mappedTables = Object.fromEntries(
		Object.entries(json.tables).map((it) => {
			const squashedIndexes = mapValues(it[1].indexes, (index) => {
				return MySqlSquasher.squashIdx(index);
			});

			const squashedFKs = mapValues(it[1].foreignKeys, (fk) => {
				return MySqlSquasher.squashFK(fk);
			});

			return [
				it[0],
				{
					name: it[1].name,
					schema: it[1].schema,
					columns: it[1].columns,
					indexes: squashedIndexes,
					foreignKeys: squashedFKs,
				},
			];
		}),
	);
	return {
		version: '4',
		dialect: json.dialect,
		tables: mappedTables,
		schemas: json.schemas,
	};
};

export const squashMysqlScheme = (json: MySqlSchema): MySqlSchemaSquashed => {
	const mappedTables = Object.fromEntries(
		Object.entries(json.tables).map((it) => {
			const squashedIndexes = mapValues(it[1].indexes, (index) => {
				return MySqlSquasher.squashIdx(index);
			});

			const squashedFKs = mapValues(it[1].foreignKeys, (fk) => {
				return MySqlSquasher.squashFK(fk);
			});

			const squashedPKs = mapValues(it[1].compositePrimaryKeys, (pk) => {
				return MySqlSquasher.squashPK(pk);
			});

			const squashedUniqueConstraints = mapValues(
				it[1].uniqueConstraints,
				(unq) => {
					return MySqlSquasher.squashUnique(unq);
				},
			);

			const squashedCheckConstraints = mapValues(it[1].checkConstraint, (check) => {
				return MySqlSquasher.squashCheck(check);
			});

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

	const mappedViews = Object.fromEntries(
		Object.entries(json.views).map(([key, value]) => {
			const meta = MySqlSquasher.squashView(value);

			return [key, {
				name: value.name,
				isExisting: value.isExisting,
				columns: value.columns,
				definition: value.definition,
				meta,
			}];
		}),
	);

	return {
		version: '5',
		dialect: json.dialect,
		tables: mappedTables,
		views: mappedViews,
	};
};

export const mysqlSchema = schema;
export const mysqlSchemaV3 = schemaV3;
export const mysqlSchemaV4 = schemaV4;
export const mysqlSchemaV5 = schemaV5;
export const mysqlSchemaSquashed = schemaSquashed;

// no prev version
export const backwardCompatibleMysqlSchema = union([mysqlSchemaV5, schema]);

export const dryMySql = mysqlSchema.parse({
	version: '5',
	dialect: 'mysql',
	id: originUUID,
	prevId: '',
	tables: {},
	schemas: {},
	views: {},
	_meta: {
		schemas: {},
		tables: {},
		columns: {},
	},
});
