import { any, boolean, enum as enumType, literal, object, record, string, TypeOf, union } from 'zod';
import { mapValues, originUUID } from '../global';

// TODO: SPANNER - verify

// ------- V3 --------
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
	onDelete: string().optional(),
}).strict();

const column = object({
	name: string(),
	type: string(),
	primaryKey: boolean(),
	notNull: boolean(),
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
	checkConstraint: record(string(), checkConstraint).default({}),
}).strict();

const viewMeta = object({
	sqlSecurity: enumType(['definer', 'invoker']),
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
const dialect = literal('googlesql');

const schemaHash = object({
	id: string(),
	prevId: string(),
});

export const schemaInternal = object({
	version: literal('0'),
	dialect: dialect,
	tables: record(string(), table),
	schemas: record(string(), string()), // TODO: SPANNER - verify
	views: record(string(), view).default({}),
	_meta: object({
		tables: record(string(), string()),
		columns: record(string(), string()),
		schemas: record(string(), string()), // TODO: SPANNER - verify
	}),
	internal: kitInternals,
}).strict();

export const schema = schemaInternal.merge(schemaHash);

const tableSquashed = object({
	name: string(),
	schema: string().optional(),
	columns: record(string(), column),
	indexes: record(string(), string()),
	foreignKeys: record(string(), string()),
	compositePrimaryKeys: record(string(), string()),
	checkConstraints: record(string(), string()).default({}),
}).strict();

const viewSquashed = view.omit({
	sqlSecurity: true,
}).extend({ meta: string() });

export const schemaSquashed = object({
	version: literal('0'),
	dialect: dialect,
	tables: record(string(), tableSquashed),
	views: record(string(), viewSquashed),
}).strict();

export type Dialect = TypeOf<typeof dialect>;
export type Column = TypeOf<typeof column>;
export type Table = TypeOf<typeof table>;
export type GoogleSqlSchema = TypeOf<typeof schema>;
export type GoogleSqlSchemaInternal = TypeOf<typeof schemaInternal>;
export type GoogleSqlKitInternals = TypeOf<typeof kitInternals>;
export type GoogleSqlSchemaSquashed = TypeOf<typeof schemaSquashed>;
export type Index = TypeOf<typeof index>;
export type ForeignKey = TypeOf<typeof fk>;
export type PrimaryKey = TypeOf<typeof compositePK>;
export type CheckConstraint = TypeOf<typeof checkConstraint>;
export type View = TypeOf<typeof view>;
export type ViewSquashed = TypeOf<typeof viewSquashed>;

export const GoogleSqlSquasher = {
	squashIdx: (idx: Index) => {
		index.parse(idx);
		return `${idx.name};${idx.columns.join(',')};${idx.isUnique}`;
	},
	unsquashIdx: (input: string): Index => {
		const [name, columnsString, isUnique] = input.split(';');
		const destructed = {
			name,
			columns: columnsString.split(','),
			isUnique: isUnique === 'true',
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
	squashFK: (fk: ForeignKey) => {
		return `${fk.name};${fk.tableFrom};${fk.columnsFrom.join(',')};${fk.tableTo};${fk.columnsTo.join(',')};${
			fk.onDelete ?? ''
		}`;
	},
	unsquashFK: (input: string): ForeignKey => {
		const [
			name,
			tableFrom,
			columnsFromStr,
			tableTo,
			columnsToStr,
			onDelete,
		] = input.split(';');

		const result: ForeignKey = fk.parse({
			name,
			tableFrom,
			columnsFrom: columnsFromStr.split(','),
			tableTo,
			columnsTo: columnsToStr.split(','),
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
		return `${view.sqlSecurity}`;
	},
	unsquashView: (meta: string): SquasherViewMeta => {
		const [sqlSecurity] = meta.split(';');
		const toReturn = {
			sqlSecurity: sqlSecurity,
		};

		return viewMeta.parse(toReturn);
	},
};

export const squashGooglesqlScheme = (json: GoogleSqlSchema): GoogleSqlSchemaSquashed => {
	const mappedTables = Object.fromEntries(
		Object.entries(json.tables).map((it) => {
			const squashedIndexes = mapValues(it[1].indexes, (index) => {
				return GoogleSqlSquasher.squashIdx(index);
			});

			const squashedFKs = mapValues(it[1].foreignKeys, (fk) => {
				return GoogleSqlSquasher.squashFK(fk);
			});

			const squashedPKs = mapValues(it[1].compositePrimaryKeys, (pk) => {
				return GoogleSqlSquasher.squashPK(pk);
			});

			const squashedCheckConstraints = mapValues(it[1].checkConstraint, (check) => {
				return GoogleSqlSquasher.squashCheck(check);
			});

			return [
				it[0],
				{
					name: it[1].name,
					columns: it[1].columns,
					indexes: squashedIndexes,
					foreignKeys: squashedFKs,
					compositePrimaryKeys: squashedPKs,
					checkConstraints: squashedCheckConstraints,
				},
			];
		}),
	);

	const mappedViews = Object.fromEntries(
		Object.entries(json.views).map(([key, value]) => {
			const meta = GoogleSqlSquasher.squashView(value);

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
		version: '0',
		dialect: json.dialect,
		tables: mappedTables,
		views: mappedViews,
	};
};

export const googlesqlSchema = schema;
export const googlesqlSchemaSquashed = schemaSquashed;

// no prev version
export const backwardCompatibleGooglesqlSchema = union([googlesqlSchema, schema]);

export const dryGoogleSql = googlesqlSchema.parse({
	version: '0',
	dialect: 'googlesql',
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
