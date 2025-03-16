import {
	any,
	array,
	boolean,
	enum as enumType,
	literal,
	never,
	object,
	record,
	string,
	TypeOf,
	union,
	ZodTypeAny,
} from 'zod';

import {
	identitySchema,
	mergedViewWithOption,
	policySquashed,
	roleSchema,
	sequenceSquashed,
} from '../dialects/postgres/ddl';

const makeChanged = <T extends ZodTypeAny>(schema: T) => {
	return object({
		type: enumType(['changed']),
		old: schema,
		new: schema,
	});
};

const makeSelfOrChanged = <T extends ZodTypeAny>(schema: T) => {
	return union([
		schema,
		object({
			type: enumType(['changed']),
			old: schema,
			new: schema,
		}),
	]);
};

export const makePatched = <T extends ZodTypeAny>(schema: T) => {
	return union([
		object({
			type: literal('added'),
			value: schema,
		}),
		object({
			type: literal('deleted'),
			value: schema,
		}),
		object({
			type: literal('changed'),
			old: schema,
			new: schema,
		}),
	]);
};

export const makeSelfOrPatched = <T extends ZodTypeAny>(schema: T) => {
	return union([
		object({
			type: literal('none'),
			value: schema,
		}),
		object({
			type: literal('added'),
			value: schema,
		}),
		object({
			type: literal('deleted'),
			value: schema,
		}),
		object({
			type: literal('changed'),
			old: schema,
			new: schema,
		}),
	]);
};

const columnSchema = object({
	name: string(),
	type: string(),
	typeSchema: string().optional(),
	primaryKey: boolean().optional(),
	default: any().optional(),
	notNull: boolean().optional(),
	// should it be optional? should if be here?
	autoincrement: boolean().optional(),
	onUpdate: boolean().optional(),
	isUnique: any().optional(), // TODO: remove, check snapshots compatibility, but all shoudl be good
	uniqueName: string().optional(),
	nullsNotDistinct: boolean().optional(),
	generated: object({
		as: string(),
		type: enumType(['stored', 'virtual']).default('stored'),
	}).optional(),
	identity: identitySchema.optional(),
}).strict();

const alteredColumnSchema = object({
	name: makeSelfOrChanged(string()),
	type: makeChanged(string()).optional(),
	default: makePatched(any()).optional(),
	primaryKey: makePatched(boolean()).optional(),
	notNull: makePatched(boolean()).optional(),
	typeSchema: makePatched(string()).optional(),
	onUpdate: makePatched(boolean()).optional(),
	autoincrement: makePatched(boolean()).optional(),
	isUnique: any().optional(), // interop, due to Drizzle Studio, ignored
	generated: makePatched(
		object({
			as: string(),
			type: enumType(['stored', 'virtual']).default('stored'),
		}),
	).optional(),
	identity: makePatched(string()).optional(),
}).strict();

const enumSchema = object({
	name: string(),
	schema: string(),
	values: array(string()),
}).strict();

const changedEnumSchema = object({
	name: string(),
	schema: string(),
	addedValues: object({
		before: string(),
		value: string(),
	}).array(),
	deletedValues: array(string()),
}).strict();

const tableScheme = object({
	name: string(),
	schema: string().default(''),
	columns: record(string(), columnSchema),
	indexes: record(string(), string()),
	foreignKeys: record(string(), string()),
	compositePrimaryKeys: record(string(), string()).default({}),
	uniqueConstraints: record(string(), string()).default({}),
	policies: record(string(), string()).default({}),
	checkConstraints: record(string(), string()).default({}),
	isRLSEnabled: boolean().default(false),
}).strict();

export const alteredTableScheme = object({
	name: string(),
	schema: string(),
	altered: alteredColumnSchema.array(),
	alteredIndexes: record(
		string(),
		object({
			__new: string(),
			__old: string(),
		}).strict(),
	),
	addedForeignKeys: record(string(), string()),
	deletedForeignKeys: record(string(), string()),
	alteredForeignKeys: record(
		string(),
		object({
			__new: string(),
			__old: string(),
		}).strict(),
	),
	addedCompositePKs: record(string(), string()),
	deletedCompositePKs: record(string(), string()),
	alteredCompositePKs: record(
		string(),
		object({
			__new: string(),
			__old: string(),
		}),
	),
	alteredUniqueConstraints: record(
		string(),
		object({
			__new: string(),
			__old: string(),
		}),
	),
	addedPolicies: record(string(), string()),
	deletedPolicies: record(string(), string()),
	alteredPolicies: record(
		string(),
		object({
			__new: string(),
			__old: string(),
		}),
	),
	alteredCheckConstraints: record(
		string(),
		object({
			__new: string(),
			__old: string(),
		}),
	),
}).strict();

const alteredViewCommon = object({
	name: string(),
	existing: boolean(),
	alteredDefinition: object({
		__old: string(),
		__new: string(),
	}).strict().optional(),
	alteredExisting: object({
		__old: boolean(),
		__new: boolean(),
	}).strict().optional(),
});

export const alteredPgViewSchema = alteredViewCommon.merge(
	object({
		schema: string(),
		deletedWithOption: mergedViewWithOption.optional(),
		addedWithOption: mergedViewWithOption.optional(),
		addedWith: mergedViewWithOption.optional(),
		deletedWith: mergedViewWithOption.optional(),
		alteredWith: mergedViewWithOption.optional(),
		alteredSchema: object({
			__old: string(),
			__new: string(),
		}).strict().optional(),
		alteredTablespace: object({
			__old: string(),
			__new: string(),
		}).strict().optional(),
		alteredUsing: object({
			__old: string(),
			__new: string(),
		}).strict().optional(),
	}).strict(),
);

const alteredMySqlViewSchema = alteredViewCommon.merge(
	object({
		alteredMeta: object({
			__old: string(),
			__new: string(),
		}).strict().optional(),
	}).strict(),
);

export const diffResultScheme = object({
	alteredTablesWithColumns: alteredTableScheme.array(),
	alteredEnums: changedEnumSchema.array(),
	alteredSequences: sequenceSquashed.array(),
	alteredRoles: roleSchema.array(),
	alteredPolicies: policySquashed.array(),
	alteredViews: alteredPgViewSchema.array(),
}).strict();

export const diffResultSchemeMysql = object({
	alteredTablesWithColumns: alteredTableScheme.array(),
	alteredEnums: never().array(),
	alteredViews: alteredMySqlViewSchema.array(),
});

export const diffResultSchemeSingleStore = object({
	alteredTablesWithColumns: alteredTableScheme.array(),
	alteredEnums: never().array(),
});

export const diffResultSchemeSQLite = object({
	alteredTablesWithColumns: alteredTableScheme.array(),
	alteredEnums: never().array(),
	alteredViews: alteredViewCommon.array(),
});

export type Column = TypeOf<typeof columnSchema>;
export type AlteredColumn = TypeOf<typeof alteredColumnSchema>;
export type Enum = TypeOf<typeof enumSchema>;
export type Sequence = TypeOf<typeof sequenceSquashed>;
export type Table = TypeOf<typeof tableScheme>;
export type AlteredTable = TypeOf<typeof alteredTableScheme>;
export type DiffResult = TypeOf<typeof diffResultScheme>;
export type DiffResultMysql = TypeOf<typeof diffResultSchemeMysql>;
export type DiffResultSingleStore = TypeOf<typeof diffResultSchemeSingleStore>;
export type DiffResultSQLite = TypeOf<typeof diffResultSchemeSQLite>;

export interface ResolverInput<T extends { name: string } = any> {
	created: T[];
	deleted: T[];
}

export interface ResolverOutput<T extends { name: string }> {
	created: T[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}

export interface ResolverOutputWithMoved<T extends { name: string } = any> {
	created: T[];
	moved: { name: string; schemaFrom: string; schemaTo: string }[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}

export interface ColumnsResolverInput<T extends { name: string } = any> {
	tableName: string;
	schema: string;
	created: T[];
	deleted: T[];
}

export interface TablePolicyResolverInput<T extends { name: string }> {
	tableName: string;
	schema: string;
	created: T[];
	deleted: T[];
}

export interface TablePolicyResolverOutput<T extends { name: string }> {
	tableName: string;
	schema: string;
	created: T[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}

export interface PolicyResolverInput<T extends { name: string }> {
	created: T[];
	deleted: T[];
}

export interface PolicyResolverOutput<T extends { name: string }> {
	created: T[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}

export interface RolesResolverInput<T extends { name: string }> {
	created: T[];
	deleted: T[];
}

export interface RolesResolverOutput<T extends { name: string }> {
	created: T[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}

export interface ColumnsResolverOutput<T extends { name: string } = any> {
	tableName: string;
	schema: string;
	created: T[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}
