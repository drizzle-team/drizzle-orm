import type {
	ColumnsResolverInput,
	ColumnsResolverOutput,
	Enum,
	PolicyResolverInput,
	PolicyResolverOutput,
	ResolverInput,
	ResolverOutput,
	ResolverOutputWithMoved,
	Sequence,
	Table,
	TablePolicyResolverInput,
	TablePolicyResolverOutput,
} from '../snapshot-differ/common';

import type { Policy } from 'src/dialects/postgres/ddl';
import type { Named, NamedWithSchema } from '../ddl';

export const mockSchemasResolver =
	(renames: Set<string>) => async (input: ResolverInput<Named>): Promise<ResolverOutput<Named>> => {
		try {
			if (
				input.created.length === 0
				|| input.deleted.length === 0
				|| renames.size === 0
			) {
				return {
					created: input.created,
					renamed: [],
					deleted: input.deleted,
				};
			}

			let createdSchemas = [...input.created];
			let deletedSchemas = [...input.deleted];

			const result: {
				created: Named[];
				renamed: { from: Named; to: Named }[];
				deleted: Named[];
			} = { created: [], renamed: [], deleted: [] };

			for (let rename of renames) {
				const [from, to] = rename.split('->');

				const idxFrom = deletedSchemas.findIndex((it) => {
					return it.name === from;
				});

				if (idxFrom >= 0) {
					const idxTo = createdSchemas.findIndex((it) => {
						return it.name === to;
					});

					result.renamed.push({
						from: deletedSchemas[idxFrom],
						to: createdSchemas[idxTo],
					});

					delete createdSchemas[idxTo];
					delete deletedSchemas[idxFrom];

					createdSchemas = createdSchemas.filter(Boolean);
					deletedSchemas = deletedSchemas.filter(Boolean);
				}
			}

			result.created = createdSchemas;
			result.deleted = deletedSchemas;

			return result;
		} catch (e) {
			console.error(e);
			throw e;
		}
	};

export const testSequencesResolver = (renames: Set<string>) =>
async (
	input: ResolverInput<Sequence>,
): Promise<ResolverOutputWithMoved<Sequence>> => {
	try {
		if (
			input.created.length === 0
			|| input.deleted.length === 0
			|| renames.size === 0
		) {
			return {
				created: input.created,
				moved: [],
				renamed: [],
				deleted: input.deleted,
			};
		}

		let createdSequences = [...input.created];
		let deletedSequences = [...input.deleted];

		const result: {
			created: Sequence[];
			moved: { name: string; schemaFrom: string; schemaTo: string }[];
			renamed: { from: Sequence; to: Sequence }[];
			deleted: Sequence[];
		} = { created: [], renamed: [], deleted: [], moved: [] };

		for (let rename of renames) {
			const [from, to] = rename.split('->');

			const idxFrom = deletedSequences.findIndex((it) => {
				return `${it.schema || 'public'}.${it.name}` === from;
			});

			if (idxFrom >= 0) {
				const idxTo = createdSequences.findIndex((it) => {
					return `${it.schema || 'public'}.${it.name}` === to;
				});

				const tableFrom = deletedSequences[idxFrom];
				const tableTo = createdSequences[idxFrom];

				if (tableFrom.schema !== tableTo.schema) {
					result.moved.push({
						name: tableFrom.name,
						schemaFrom: tableFrom.schema,
						schemaTo: tableTo.schema,
					});
				}

				if (tableFrom.name !== tableTo.name) {
					result.renamed.push({
						from: deletedSequences[idxFrom],
						to: createdSequences[idxTo],
					});
				}

				delete createdSequences[idxTo];
				delete deletedSequences[idxFrom];

				createdSequences = createdSequences.filter(Boolean);
				deletedSequences = deletedSequences.filter(Boolean);
			}
		}

		result.created = createdSequences;
		result.deleted = deletedSequences;

		return result;
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const mockEnumsResolver = (renames: Set<string>) =>
async (
	input: ResolverInput<Enum>,
): Promise<ResolverOutputWithMoved<Enum>> => {
	try {
		if (
			input.created.length === 0
			|| input.deleted.length === 0
			|| renames.size === 0
		) {
			return {
				created: input.created,
				moved: [],
				renamed: [],
				deleted: input.deleted,
			};
		}

		let createdEnums = [...input.created];
		let deletedEnums = [...input.deleted];

		const result: {
			created: Enum[];
			moved: { name: string; schemaFrom: string; schemaTo: string }[];
			renamed: { from: Enum; to: Enum }[];
			deleted: Enum[];
		} = { created: [], renamed: [], deleted: [], moved: [] };

		for (let rename of renames) {
			const [from, to] = rename.split('->');

			const idxFrom = deletedEnums.findIndex((it) => {
				return `${it.schema || 'public'}.${it.name}` === from;
			});

			if (idxFrom >= 0) {
				const idxTo = createdEnums.findIndex((it) => {
					return `${it.schema || 'public'}.${it.name}` === to;
				});

				const tableFrom = deletedEnums[idxFrom];
				const tableTo = createdEnums[idxFrom];

				if (tableFrom.schema !== tableTo.schema) {
					result.moved.push({
						name: tableFrom.name,
						schemaFrom: tableFrom.schema,
						schemaTo: tableTo.schema,
					});
				}

				if (tableFrom.name !== tableTo.name) {
					result.renamed.push({
						from: deletedEnums[idxFrom],
						to: createdEnums[idxTo],
					});
				}

				delete createdEnums[idxTo];
				delete deletedEnums[idxFrom];

				createdEnums = createdEnums.filter(Boolean);
				deletedEnums = deletedEnums.filter(Boolean);
			}
		}

		result.created = createdEnums;
		result.deleted = deletedEnums;

		return result;
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const mockTablesResolver = (renames: Set<string>) =>
async (
	input: ResolverInput<Table>,
): Promise<ResolverOutputWithMoved<Table>> => {
	try {
		if (
			input.created.length === 0
			|| input.deleted.length === 0
			|| renames.size === 0
		) {
			return {
				created: input.created,
				moved: [],
				renamed: [],
				deleted: input.deleted,
			};
		}

		let createdTables = [...input.created];
		let deletedTables = [...input.deleted];

		const result: {
			created: Table[];
			moved: { name: string; schemaFrom: string; schemaTo: string }[];
			renamed: { from: Table; to: Table }[];
			deleted: Table[];
		} = { created: [], renamed: [], deleted: [], moved: [] };

		for (let rename of renames) {
			const [from, to] = rename.split('->');

			const idxFrom = deletedTables.findIndex((it) => {
				return `${it.schema || 'public'}.${it.name}` === from;
			});

			if (idxFrom >= 0) {
				const idxTo = createdTables.findIndex((it) => {
					return `${it.schema || 'public'}.${it.name}` === to;
				});

				const tableFrom = deletedTables[idxFrom];
				const tableTo = createdTables[idxFrom];

				if (tableFrom.schema !== tableTo.schema) {
					result.moved.push({
						name: tableFrom.name,
						schemaFrom: tableFrom.schema,
						schemaTo: tableTo.schema,
					});
				}

				if (tableFrom.name !== tableTo.name) {
					result.renamed.push({
						from: deletedTables[idxFrom],
						to: createdTables[idxTo],
					});
				}

				delete createdTables[idxTo];
				delete deletedTables[idxFrom];

				createdTables = createdTables.filter(Boolean);
				deletedTables = deletedTables.filter(Boolean);
			}
		}

		result.created = createdTables;
		result.deleted = deletedTables;

		return result;
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const mockColumnsResolver =
	<T extends { name: string; table: string; schema?: string | undefined }>(renames: Set<string>) =>
	async (
		input: ColumnsResolverInput<T>,
	): Promise<ColumnsResolverOutput<T>> => {
		try {
			if (
				input.created.length === 0
				|| input.deleted.length === 0
				|| renames.size === 0
			) {
				return {
					tableName: input.tableName,
					schema: input.schema,
					created: input.created,
					renamed: [],
					deleted: input.deleted,
				};
			}

			let createdColumns = [...input.created];
			let deletedColumns = [...input.deleted];

			const renamed: { from: T; to: T }[] = [];

			const schema = input.schema || 'public';

			for (let rename of renames) {
				const [from, to] = rename.split('->');

				const idxFrom = deletedColumns.findIndex((it) => {
					return `${schema}.${input.tableName}.${it.name}` === from;
				});

				if (idxFrom >= 0) {
					const idxTo = createdColumns.findIndex((it) => {
						return `${schema}.${input.tableName}.${it.name}` === to;
					});
					if (idxTo < 0) {
						throw new Error(
							`no column ${to} in ${input.tableName}:[${
								createdColumns
									.map((it) => JSON.stringify(it))
									.join(', ')
							}]`,
						);
					}

					renamed.push({
						from: deletedColumns[idxFrom],
						to: createdColumns[idxTo],
					});

					delete createdColumns[idxTo];
					delete deletedColumns[idxFrom];

					createdColumns = createdColumns.filter(Boolean);
					deletedColumns = deletedColumns.filter(Boolean);
				}
			}

			return {
				tableName: input.tableName,
				schema: input.schema,
				created: createdColumns,
				deleted: deletedColumns,
				renamed,
			};
		} catch (e) {
			console.error(e);
			throw e;
		}
	};

export const mockPolicyResolver = (renames: Set<string>) =>
async (
	input: TablePolicyResolverInput<Policy>,
): Promise<TablePolicyResolverOutput<Policy>> => {
	try {
		if (
			input.created.length === 0
			|| input.deleted.length === 0
			|| renames.size === 0
		) {
			return {
				tableName: input.tableName,
				schema: input.schema,
				created: input.created,
				renamed: [],
				deleted: input.deleted,
			};
		}

		let createdPolicies = [...input.created];
		let deletedPolicies = [...input.deleted];

		const renamed: { from: Policy; to: Policy }[] = [];

		const schema = input.schema || 'public';
		for (let rename of renames) {
			const [from, to] = rename.split('->');
			const idxFrom = deletedPolicies.findIndex((it) => {
				return `${schema}.${input.tableName}.${it.name}` === from;
			});

			if (idxFrom >= 0) {
				const idxTo = createdPolicies.findIndex((it) => {
					return `${schema}.${input.tableName}.${it.name}` === to;
				});

				renamed.push({
					from: deletedPolicies[idxFrom],
					to: createdPolicies[idxTo],
				});

				delete createdPolicies[idxTo];
				delete deletedPolicies[idxFrom];

				createdPolicies = createdPolicies.filter(Boolean);
				deletedPolicies = deletedPolicies.filter(Boolean);
			}
		}

		return {
			tableName: input.tableName,
			schema: input.schema,
			created: createdPolicies,
			deleted: deletedPolicies,
			renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const mockIndPolicyResolver = (renames: Set<string>) =>
async (
	input: PolicyResolverInput<Policy> & { schema: string },
): Promise<PolicyResolverOutput<Policy>> => {
	try {
		if (
			input.created.length === 0
			|| input.deleted.length === 0
			|| renames.size === 0
		) {
			return {
				created: input.created,
				renamed: [],
				deleted: input.deleted,
			};
		}

		let createdPolicies = [...input.created];
		let deletedPolicies = [...input.deleted];

		const renamed: { from: Policy; to: Policy }[] = [];

		const schema = input.schema || 'public';
		for (let rename of renames) {
			const [from, to] = rename.split('->');
			const idxFrom = deletedPolicies.findIndex((it) => {
				return `${schema || 'public'}.${it.name}` === from;
			});

			if (idxFrom >= 0) {
				const idxTo = createdPolicies.findIndex((it) => {
					return `${schema}.${it.name}` === to;
				});

				renamed.push({
					from: deletedPolicies[idxFrom],
					to: createdPolicies[idxTo],
				});

				delete createdPolicies[idxTo];
				delete deletedPolicies[idxFrom];

				createdPolicies = createdPolicies.filter(Boolean);
				deletedPolicies = deletedPolicies.filter(Boolean);
			}
		}

		return {
			created: createdPolicies,
			deleted: deletedPolicies,
			renamed,
		};
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const mockedNamedWithSchemaResolver = <T extends NamedWithSchema>(renames: Set<string>) =>
async (
	input: ResolverInput<T>,
): Promise<ResolverOutputWithMoved<T>> => {
	try {
		if (
			input.created.length === 0
			|| input.deleted.length === 0
			|| renames.size === 0
		) {
			return {
				created: input.created,
				moved: [],
				renamed: [],
				deleted: input.deleted,
			};
		}

		let createdViews = [...input.created];
		let deletedViews = [...input.deleted];

		const result: {
			created: T[];
			moved: { name: string; schemaFrom: string; schemaTo: string }[];
			renamed: { from: T; to: T }[];
			deleted: T[];
		} = { created: [], renamed: [], deleted: [], moved: [] };

		for (let rename of renames) {
			const [from, to] = rename.split('->');

			const idxFrom = deletedViews.findIndex((it) => {
				return `${it.schema || 'public'}.${it.name}` === from;
			});

			if (idxFrom < 0) continue;

			const idxTo = createdViews.findIndex((it) => {
				return `${it.schema || 'public'}.${it.name}` === to;
			});

			const viewFrom = deletedViews[idxFrom];
			const viewTo = createdViews[idxTo];

			if (viewFrom.schema !== viewTo.schema) {
				result.moved.push({
					name: viewFrom.name,
					schemaFrom: viewFrom.schema,
					schemaTo: viewTo.schema,
				});
			}

			if (viewFrom.name !== viewTo.name) {
				result.renamed.push({
					from: deletedViews[idxFrom],
					to: createdViews[idxTo],
				});
			}

			delete createdViews[idxTo];
			delete deletedViews[idxFrom];

			createdViews = createdViews.filter(Boolean);
			deletedViews = deletedViews.filter(Boolean);
		}

		result.created = createdViews;
		result.deleted = deletedViews;

		return result;
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const mockedNamedResolver = <T extends Named>(renames: Set<string>) =>
async (
	input: ColumnsResolverInput<T>,
): Promise<ColumnsResolverOutput<T>> => {
	try {
		if (
			input.created.length === 0
			|| input.deleted.length === 0
			|| renames.size === 0
		) {
			return {
				tableName: input.tableName,
				schema: input.schema,
				created: input.created,
				renamed: [],
				deleted: input.deleted,
			};
		}

		let createdItems = [...input.created];
		let deletedItems = [...input.deleted];

		const result: {
			tableName: string;
			schema: string;
			created: T[];
			renamed: { from: T; to: T }[];
			deleted: T[];
		} = {
			tableName: input.tableName,
			schema: input.schema,
			created: [],
			renamed: [],
			deleted: [],
		};

		for (let rename of renames) {
			const [from, to] = rename.split('->');

			const idxFrom = deletedItems.findIndex((it) => {
				return (
					`${input.schema || 'public'}.${input.tableName}.${it.name}` === from
				);
			});

			if (idxFrom < 0) continue;

			const idxTo = createdItems.findIndex((it) => {
				return (
					`${input.schema || 'public'}.${input.tableName}.${it.name}` === to
				);
			});

			const uniqueFrom = deletedItems[idxFrom];
			const uniqueTo = createdItems[idxTo];

			if (uniqueFrom.name !== uniqueTo.name) {
				result.renamed.push({
					from: deletedItems[idxFrom],
					to: createdItems[idxTo],
				});
			}

			delete createdItems[idxTo];
			delete deletedItems[idxFrom];

			createdItems = createdItems.filter(Boolean);
			deletedItems = deletedItems.filter(Boolean);
		}

		result.created = createdItems;
		result.deleted = deletedItems;

		return result;
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const mockedRolesResolver = <T extends Named>(renames: Set<string>) =>
async (
	input: ResolverInput<T>,
): Promise<ResolverOutput<T>> => {
	try {
		if (
			input.created.length === 0
			|| input.deleted.length === 0
			|| renames.size === 0
		) {
			return {
				created: input.created,
				renamed: [],
				deleted: input.deleted,
			};
		}

		let createdItems = [...input.created];
		let deletedItems = [...input.deleted];

		const result: {
			created: T[];
			renamed: { from: T; to: T }[];
			deleted: T[];
		} = {
			created: [],
			renamed: [],
			deleted: [],
		};

		for (let rename of renames) {
			const [from, to] = rename.split('->');

			const idxFrom = deletedItems.findIndex((it) => {
				return (
					it.name === from
				);
			});

			if (idxFrom < 0) continue;

			const idxTo = createdItems.findIndex((it) => {
				return it.name === to;
			});

			const uniqueFrom = deletedItems[idxFrom];
			const uniqueTo = createdItems[idxTo];

			if (uniqueFrom.name !== uniqueTo.name) {
				result.renamed.push({
					from: deletedItems[idxFrom],
					to: createdItems[idxTo],
				});
			}

			delete createdItems[idxTo];
			delete deletedItems[idxFrom];

			createdItems = createdItems.filter(Boolean);
			deletedItems = deletedItems.filter(Boolean);
		}

		result.created = createdItems;
		result.deleted = deletedItems;

		return result;
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const mockRolesResolver = mockedRolesResolver;
export const mockViewsResolver = mockedNamedWithSchemaResolver;
export const mockUniquesResolver = mockedNamedResolver;
export const mockIndexesResolver = mockedNamedResolver;
export const mockChecksResolver = mockedNamedResolver;
export const mockPKsResolver = mockedNamedResolver;
export const mockFKsResolver = mockedNamedResolver;
