import chalk from 'chalk';
import { render } from 'hanji';
import type { TypeOf, ZodTypeAny } from 'zod';
import { any, array, boolean, enum as enumType, literal, never, object, record, string, union } from 'zod';
import { ResolveColumnSelect, ResolveSchemasSelect, ResolveSelect, ResolveSelectNamed } from '../cli/views';
import { _prepareAddColumns, _prepareDropColumns } from './jsonStatements';
import type { ViewSquashed } from './mysql-v5/mysqlSchema';
import type { Policy, Role, View } from './postgres-v7/pgSchema';
import { mergedViewWithOption, policySquashed, roleSchema, sequenceSquashed } from './postgres-v7/pgSchema';
import type { View as SQLiteView } from './sqlite-v6/sqliteSchema';

export type Named = { name: string };
export type NamedWithSchema = {
	name: string;
	schema: string;
};

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
	isUnique: any().optional(),
	uniqueName: string().optional(),
	nullsNotDistinct: boolean().optional(),
	generated: object({
		as: string(),
		type: enumType(['stored', 'virtual']).default('stored'),
	}).optional(),
	identity: string().optional(),
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
	addedIndexes: record(string(), string()),
	deletedIndexes: record(string(), string()),
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
	addedUniqueConstraints: record(string(), string()),
	deletedUniqueConstraints: record(string(), string()),
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
	addedCheckConstraints: record(
		string(),
		string(),
	),
	deletedCheckConstraints: record(
		string(),
		string(),
	),
	alteredCheckConstraints: record(
		string(),
		object({
			__new: string(),
			__old: string(),
		}),
	),
}).strict();

export const alteredViewCommon = object({
	name: string(),
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

export type Column = TypeOf<typeof columnSchema>;
export type AlteredColumn = TypeOf<typeof alteredColumnSchema>;
export type Enum = TypeOf<typeof enumSchema>;
export type Sequence = TypeOf<typeof sequenceSquashed>;
export type Table = TypeOf<typeof tableScheme>;
export type AlteredTable = TypeOf<typeof alteredTableScheme>;
export type DiffResult = TypeOf<typeof diffResultScheme>;

export type DiffResultMysql = TypeOf<typeof diffResultSchemeMysql>;

export interface ResolverInput<T extends { name: string }> {
	created: T[];
	deleted: T[];
}

export interface ResolverOutput<T extends { name: string }> {
	created: T[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}

export interface ResolverOutputWithMoved<T extends { name: string }> {
	created: T[];
	moved: { name: string; schemaFrom: string; schemaTo: string }[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}

export interface ColumnsResolverInput<T extends { name: string }> {
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

export interface ColumnsResolverOutput<T extends { name: string }> {
	tableName: string;
	schema: string;
	created: T[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}

export const schemaChangeFor = (
	table: NamedWithSchema,
	renamedSchemas: { from: Named; to: Named }[],
) => {
	for (let ren of renamedSchemas) {
		if (table.schema === ren.from.name) {
			return { key: `${ren.to.name}.${table.name}`, schema: ren.to.name };
		}
	}

	return {
		key: `${table.schema || 'public'}.${table.name}`,
		schema: table.schema,
	};
};

export const nameChangeFor = (table: Named, renamed: { from: Named; to: Named }[]) => {
	for (let ren of renamed) {
		if (table.name === ren.from.name) {
			return { name: ren.to.name };
		}
	}

	return {
		name: table.name,
	};
};

export const nameSchemaChangeFor = (
	table: NamedWithSchema,
	renamedTables: { from: NamedWithSchema; to: NamedWithSchema }[],
) => {
	for (let ren of renamedTables) {
		if (table.name === ren.from.name && table.schema === ren.from.schema) {
			return {
				key: `${ren.to.schema || 'public'}.${ren.to.name}`,
				name: ren.to.name,
				schema: ren.to.schema,
			};
		}
	}

	return {
		key: `${table.schema || 'public'}.${table.name}`,
		name: table.name,
		schema: table.schema,
	};
};

export const columnChangeFor = (
	column: string,
	renamedColumns: { from: Named; to: Named }[],
) => {
	for (let ren of renamedColumns) {
		if (column === ren.from.name) {
			return ren.to.name;
		}
	}

	return column;
};

export const schemasResolver = async (
	input: ResolverInput<Table>,
): Promise<ResolverOutput<Table>> => {
	try {
		const { created, deleted, renamed } = await promptSchemasConflict(
			input.created,
			input.deleted,
		);

		return { created: created, deleted: deleted, renamed: renamed };
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const tablesResolver = async (
	input: ResolverInput<Table>,
): Promise<ResolverOutputWithMoved<Table>> => {
	try {
		const { created, deleted, moved, renamed } = await promptNamedWithSchemasConflict(
			input.created,
			input.deleted,
			'table',
		);

		return {
			created: created,
			deleted: deleted,
			moved: moved,
			renamed: renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const sqliteViewsResolver = async (
	input: ResolverInput<SQLiteView & { schema: '' }>,
): Promise<ResolverOutputWithMoved<SQLiteView>> => {
	try {
		const { created, deleted, moved, renamed } = await promptNamedWithSchemasConflict(
			input.created,
			input.deleted,
			'view',
		);

		return {
			created: created,
			deleted: deleted,
			moved: moved,
			renamed: renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const mySqlViewsResolver = async (
	input: ResolverInput<ViewSquashed & { schema: '' }>,
): Promise<ResolverOutputWithMoved<ViewSquashed>> => {
	try {
		const { created, deleted, moved, renamed } = await promptNamedWithSchemasConflict(
			input.created,
			input.deleted,
			'view',
		);

		return {
			created: created,
			deleted: deleted,
			moved: moved,
			renamed: renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const viewsResolver = async (
	input: ResolverInput<View>,
): Promise<ResolverOutputWithMoved<View>> => {
	try {
		const { created, deleted, moved, renamed } = await promptNamedWithSchemasConflict(
			input.created,
			input.deleted,
			'view',
		);

		return {
			created: created,
			deleted: deleted,
			moved: moved,
			renamed: renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export interface RenamePropmtItem<T> {
	from: T;
	to: T;
}

export const isRenamePromptItem = <T extends Named>(
	item: RenamePropmtItem<T> | T,
): item is RenamePropmtItem<T> => {
	return 'from' in item && 'to' in item;
};

export const sequencesResolver = async (
	input: ResolverInput<Sequence>,
): Promise<ResolverOutputWithMoved<Sequence>> => {
	try {
		const { created, deleted, moved, renamed } = await promptNamedWithSchemasConflict(
			input.created,
			input.deleted,
			'sequence',
		);

		return {
			created: created,
			deleted: deleted,
			moved: moved,
			renamed: renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const roleResolver = async (
	input: RolesResolverInput<Role>,
): Promise<RolesResolverOutput<Role>> => {
	const result = await promptNamedConflict(
		input.created,
		input.deleted,
		'role',
	);
	return {
		created: result.created,
		deleted: result.deleted,
		renamed: result.renamed,
	};
};

export const policyResolver = async (
	input: TablePolicyResolverInput<Policy>,
): Promise<TablePolicyResolverOutput<Policy>> => {
	const result = await promptColumnsConflicts(
		input.tableName,
		input.created,
		input.deleted,
	);
	return {
		tableName: input.tableName,
		schema: input.schema,
		created: result.created,
		deleted: result.deleted,
		renamed: result.renamed,
	};
};

export const indPolicyResolver = async (
	input: PolicyResolverInput<Policy>,
): Promise<PolicyResolverOutput<Policy>> => {
	const result = await promptNamedConflict(
		input.created,
		input.deleted,
		'policy',
	);
	return {
		created: result.created,
		deleted: result.deleted,
		renamed: result.renamed,
	};
};

export const enumsResolver = async (
	input: ResolverInput<Enum>,
): Promise<ResolverOutputWithMoved<Enum>> => {
	try {
		const { created, deleted, moved, renamed } = await promptNamedWithSchemasConflict(
			input.created,
			input.deleted,
			'enum',
		);

		return {
			created: created,
			deleted: deleted,
			moved: moved,
			renamed: renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const columnsResolver = async (
	input: ColumnsResolverInput<Column>,
): Promise<ColumnsResolverOutput<Column>> => {
	const result = await promptColumnsConflicts(
		input.tableName,
		input.created,
		input.deleted,
	);
	return {
		tableName: input.tableName,
		schema: input.schema,
		created: result.created,
		deleted: result.deleted,
		renamed: result.renamed,
	};
};

export const promptColumnsConflicts = async <T extends Named>(
	tableName: string,
	newColumns: T[],
	missingColumns: T[],
) => {
	if (newColumns.length === 0 || missingColumns.length === 0) {
		return { created: newColumns, renamed: [], deleted: missingColumns };
	}
	const result: { created: T[]; renamed: { from: T; to: T }[]; deleted: T[] } = {
		created: [],
		renamed: [],
		deleted: [],
	};

	let index = 0;
	let leftMissing = [...missingColumns];

	do {
		const created = newColumns[index];

		const renames: RenamePropmtItem<T>[] = leftMissing.map((it) => {
			return { from: it, to: created };
		});

		const promptData: (RenamePropmtItem<T> | T)[] = [created, ...renames];

		const { status, data } = await render(
			new ResolveColumnSelect<T>(tableName, created, promptData),
		);
		if (status === 'aborted') {
			console.error('ERROR');
			process.exit(1);
		}

		if (isRenamePromptItem(data)) {
			console.log(
				`${chalk.yellow('~')} ${data.from.name} › ${data.to.name} ${
					chalk.gray(
						'column will be renamed',
					)
				}`,
			);
			result.renamed.push(data);
			// this will make [item1, undefined, item2]
			delete leftMissing[leftMissing.indexOf(data.from)];
			// this will make [item1, item2]
			leftMissing = leftMissing.filter(Boolean);
		} else {
			console.log(
				`${chalk.green('+')} ${data.name} ${
					chalk.gray(
						'column will be created',
					)
				}`,
			);
			result.created.push(created);
		}
		index += 1;
	} while (index < newColumns.length);
	console.log(
		chalk.gray(`--- all columns conflicts in ${tableName} table resolved ---\n`),
	);

	result.deleted.push(...leftMissing);
	return result;
};

export const promptNamedConflict = async <T extends Named>(
	newItems: T[],
	missingItems: T[],
	entity: 'role' | 'policy',
): Promise<{
	created: T[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}> => {
	if (missingItems.length === 0 || newItems.length === 0) {
		return {
			created: newItems,
			renamed: [],
			deleted: missingItems,
		};
	}

	const result: {
		created: T[];
		renamed: { from: T; to: T }[];
		deleted: T[];
	} = { created: [], renamed: [], deleted: [] };
	let index = 0;
	let leftMissing = [...missingItems];
	do {
		const created = newItems[index];
		const renames: RenamePropmtItem<T>[] = leftMissing.map((it) => {
			return { from: it, to: created };
		});

		const promptData: (RenamePropmtItem<T> | T)[] = [created, ...renames];

		const { status, data } = await render(
			new ResolveSelectNamed<T>(created, promptData, entity),
		);
		if (status === 'aborted') {
			console.error('ERROR');
			process.exit(1);
		}

		if (isRenamePromptItem(data)) {
			console.log(
				`${chalk.yellow('~')} ${data.from.name} › ${data.to.name} ${
					chalk.gray(
						`${entity} will be renamed/moved`,
					)
				}`,
			);

			if (data.from.name !== data.to.name) {
				result.renamed.push(data);
			}

			delete leftMissing[leftMissing.indexOf(data.from)];
			leftMissing = leftMissing.filter(Boolean);
		} else {
			console.log(
				`${chalk.green('+')} ${data.name} ${
					chalk.gray(
						`${entity} will be created`,
					)
				}`,
			);
			result.created.push(created);
		}
		index += 1;
	} while (index < newItems.length);
	console.log(chalk.gray(`--- all ${entity} conflicts resolved ---\n`));
	result.deleted.push(...leftMissing);
	return result;
};

export const promptNamedWithSchemasConflict = async <T extends NamedWithSchema>(
	newItems: T[],
	missingItems: T[],
	entity: 'table' | 'enum' | 'sequence' | 'view',
): Promise<{
	created: T[];
	renamed: { from: T; to: T }[];
	moved: { name: string; schemaFrom: string; schemaTo: string }[];
	deleted: T[];
}> => {
	if (missingItems.length === 0 || newItems.length === 0) {
		return {
			created: newItems,
			renamed: [],
			moved: [],
			deleted: missingItems,
		};
	}

	const result: {
		created: T[];
		renamed: { from: T; to: T }[];
		moved: { name: string; schemaFrom: string; schemaTo: string }[];
		deleted: T[];
	} = { created: [], renamed: [], moved: [], deleted: [] };
	let index = 0;
	let leftMissing = [...missingItems];
	do {
		const created = newItems[index];
		const renames: RenamePropmtItem<T>[] = leftMissing.map((it) => {
			return { from: it, to: created };
		});

		const promptData: (RenamePropmtItem<T> | T)[] = [created, ...renames];

		const { status, data } = await render(
			new ResolveSelect<T>(created, promptData, entity),
		);
		if (status === 'aborted') {
			console.error('ERROR');
			process.exit(1);
		}

		if (isRenamePromptItem(data)) {
			const schemaFromPrefix = !data.from.schema || data.from.schema === 'public'
				? ''
				: `${data.from.schema}.`;
			const schemaToPrefix = !data.to.schema || data.to.schema === 'public'
				? ''
				: `${data.to.schema}.`;

			console.log(
				`${chalk.yellow('~')} ${schemaFromPrefix}${data.from.name} › ${schemaToPrefix}${data.to.name} ${
					chalk.gray(
						`${entity} will be renamed/moved`,
					)
				}`,
			);

			if (data.from.name !== data.to.name) {
				result.renamed.push(data);
			}

			if (data.from.schema !== data.to.schema) {
				result.moved.push({
					name: data.from.name,
					schemaFrom: data.from.schema || 'public',
					schemaTo: data.to.schema || 'public',
				});
			}

			delete leftMissing[leftMissing.indexOf(data.from)];
			leftMissing = leftMissing.filter(Boolean);
		} else {
			console.log(
				`${chalk.green('+')} ${data.name} ${
					chalk.gray(
						`${entity} will be created`,
					)
				}`,
			);
			result.created.push(created);
		}
		index += 1;
	} while (index < newItems.length);
	console.log(chalk.gray(`--- all ${entity} conflicts resolved ---\n`));
	result.deleted.push(...leftMissing);
	return result;
};

export const promptSchemasConflict = async <T extends Named>(
	newSchemas: T[],
	missingSchemas: T[],
): Promise<{ created: T[]; renamed: { from: T; to: T }[]; deleted: T[] }> => {
	if (missingSchemas.length === 0 || newSchemas.length === 0) {
		return { created: newSchemas, renamed: [], deleted: missingSchemas };
	}

	const result: { created: T[]; renamed: { from: T; to: T }[]; deleted: T[] } = {
		created: [],
		renamed: [],
		deleted: [],
	};
	let index = 0;
	let leftMissing = [...missingSchemas];
	do {
		const created = newSchemas[index];
		const renames: RenamePropmtItem<T>[] = leftMissing.map((it) => {
			return { from: it, to: created };
		});

		const promptData: (RenamePropmtItem<T> | T)[] = [created, ...renames];

		const { status, data } = await render(
			new ResolveSchemasSelect<T>(created, promptData),
		);
		if (status === 'aborted') {
			console.error('ERROR');
			process.exit(1);
		}

		if (isRenamePromptItem(data)) {
			console.log(
				`${chalk.yellow('~')} ${data.from.name} › ${data.to.name} ${
					chalk.gray(
						'schema will be renamed',
					)
				}`,
			);
			result.renamed.push(data);
			delete leftMissing[leftMissing.indexOf(data.from)];
			leftMissing = leftMissing.filter(Boolean);
		} else {
			console.log(
				`${chalk.green('+')} ${data.name} ${
					chalk.gray(
						'schema will be created',
					)
				}`,
			);
			result.created.push(created);
		}
		index += 1;
	} while (index < newSchemas.length);
	console.log(chalk.gray('--- all schemas conflicts resolved ---\n'));
	result.deleted.push(...leftMissing);
	return result;
};
