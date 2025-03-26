'use-strict';
import { diff } from 'json-diff';

export function diffForRenamedTables(pairs) {
	// raname table1 to name of table2, so we can apply diffs
	const renamed = pairs.map((it) => {
		const from = it.from;
		const to = it.to;
		const newFrom = { ...from, name: to.name };
		return [newFrom, to];
	});

	// find any alternations made to a renamed table
	const altered = renamed.map((pair) => {
		return diffForRenamedTable(pair[0], pair[1]);
	});

	return altered;
}

function diffForRenamedTable(t1, t2) {
	t1.name = t2.name;
	const diffed = diff(t1, t2) || {};
	diffed.name = t2.name;

	return findAlternationsInTable(diffed, t2.schema);
}

export function diffForRenamedColumn(t1, t2) {
	const renamed = { ...t1, name: t2.name };
	const diffed = diff(renamed, t2) || {};
	diffed.name = t2.name;

	return alternationsInColumn(diffed);
}

const update1to2 = (json) => {
	Object.entries(json).forEach(([key, val]) => {
		if ('object' !== typeof val) return;

		if (val.hasOwnProperty('references')) {
			const ref = val['references'];
			const fkName = ref['foreignKeyName'];
			const table = ref['table'];
			const column = ref['column'];
			const onDelete = ref['onDelete'];
			const onUpdate = ref['onUpdate'];
			const newRef = `${fkName};${table};${column};${onDelete ?? ''};${onUpdate ?? ''}`;
			val['references'] = newRef;
		} else {
			update1to2(val);
		}
	});
};

const mapArraysDiff = (source, diff) => {
	const sequence = [];
	let sourceIndex = 0;
	for (let i = 0; i < diff.length; i++) {
		const it = diff[i];
		if (it.length === 1) {
			sequence.push({ type: 'same', value: source[sourceIndex] });
			sourceIndex += 1;
		} else {
			if (it[0] === '-') {
				sequence.push({ type: 'removed', value: it[1] });
			} else {
				sequence.push({ type: 'added', value: it[1], before: '' });
			}
		}
	}
	const result = sequence.reverse().reduce(
		(acc, it) => {
			if (it.type === 'same') {
				acc.prev = it.value;
			}

			if (it.type === 'added' && acc.prev) {
				it.before = acc.prev;
			}
			acc.result.push(it);
			return acc;
		},
		{ result: [] },
	);

	return result.result.reverse();
};

export function diffSchemasOrTables(left, right) {
	left = JSON.parse(JSON.stringify(left));
	right = JSON.parse(JSON.stringify(right));

	const result = Object.entries(diff(left, right) ?? {});

	const added = result
		.filter((it) => it[0].endsWith('__added'))
		.map((it) => it[1]);
	const deleted = result
		.filter((it) => it[0].endsWith('__deleted'))
		.map((it) => it[1]);

	return { added, deleted };
}

export function diffIndPolicies(left, right) {
	left = JSON.parse(JSON.stringify(left));
	right = JSON.parse(JSON.stringify(right));

	const result = Object.entries(diff(left, right) ?? {});

	const added = result
		.filter((it) => it[0].endsWith('__added'))
		.map((it) => it[1]);
	const deleted = result
		.filter((it) => it[0].endsWith('__deleted'))
		.map((it) => it[1]);

	return { added, deleted };
}

export function diffColumns(left, right) {
	left = JSON.parse(JSON.stringify(left));
	right = JSON.parse(JSON.stringify(right));
	const result = diff(left, right) ?? {};

	const alteredTables = Object.fromEntries(
		Object.entries(result)
			.filter((it) => {
				return !(it[0].includes('__added') || it[0].includes('__deleted'));
			})
			.map((tableEntry) => {
				// const entry = { name: it, ...result[it] }
				const deletedColumns = Object.entries(tableEntry[1].columns ?? {})
					.filter((it) => {
						return it[0].endsWith('__deleted');
					})
					.map((it) => {
						return it[1];
					});

				const addedColumns = Object.entries(tableEntry[1].columns ?? {})
					.filter((it) => {
						return it[0].endsWith('__added');
					})
					.map((it) => {
						return it[1];
					});

				tableEntry[1].columns = {
					added: addedColumns,
					deleted: deletedColumns,
				};
				const table = left[tableEntry[0]];
				return [
					tableEntry[0],
					{ name: table.name, schema: table.schema, ...tableEntry[1] },
				];
			}),
	);

	return alteredTables;
}

export function diffPolicies(left, right) {
	left = JSON.parse(JSON.stringify(left));
	right = JSON.parse(JSON.stringify(right));
	const result = diff(left, right) ?? {};

	const alteredTables = Object.fromEntries(
		Object.entries(result)
			.filter((it) => {
				return !(it[0].includes('__added') || it[0].includes('__deleted'));
			})
			.map((tableEntry) => {
				// const entry = { name: it, ...result[it] }
				const deletedPolicies = Object.entries(tableEntry[1].policies ?? {})
					.filter((it) => {
						return it[0].endsWith('__deleted');
					})
					.map((it) => {
						return it[1];
					});

				const addedPolicies = Object.entries(tableEntry[1].policies ?? {})
					.filter((it) => {
						return it[0].endsWith('__added');
					})
					.map((it) => {
						return it[1];
					});

				tableEntry[1].policies = {
					added: addedPolicies,
					deleted: deletedPolicies,
				};
				const table = left[tableEntry[0]];
				return [
					tableEntry[0],
					{ name: table.name, schema: table.schema, ...tableEntry[1] },
				];
			}),
	);

	return alteredTables;
}

export function applyJsonDiff(json1, json2) {
	json1 = JSON.parse(JSON.stringify(json1));
	json2 = JSON.parse(JSON.stringify(json2));

	// deep copy, needed because of the bug in diff library
	const rawDiff = diff(json1, json2);

	const difference = JSON.parse(JSON.stringify(rawDiff || {}));
	difference.schemas = difference.schemas || {};
	difference.tables = difference.tables || {};
	difference.enums = difference.enums || {};
	difference.sequences = difference.sequences || {};
	difference.roles = difference.roles || {};
	difference.policies = difference.policies || {};
	difference.views = difference.views || {};

	// remove added/deleted schemas
	const schemaKeys = Object.keys(difference.schemas);
	for (let key of schemaKeys) {
		if (key.endsWith('__added') || key.endsWith('__deleted')) {
			delete difference.schemas[key];
			continue;
		}
	}

	// remove added/deleted tables
	const tableKeys = Object.keys(difference.tables);
	for (let key of tableKeys) {
		if (key.endsWith('__added') || key.endsWith('__deleted')) {
			delete difference.tables[key];
			continue;
		}

		// supply table name and schema for altered tables
		const table = json1.tables[key];
		difference.tables[key] = {
			name: table.name,
			schema: table.schema,
			...difference.tables[key],
		};
	}

	for (let [tableKey, tableValue] of Object.entries(difference.tables)) {
		const table = difference.tables[tableKey];
		const columns = tableValue.columns || {};
		const columnKeys = Object.keys(columns);
		for (let key of columnKeys) {
			if (key.endsWith('__added') || key.endsWith('__deleted')) {
				delete table.columns[key];
				continue;
			}
		}

		if (Object.keys(columns).length === 0) {
			delete table['columns'];
		}

		if (
			'name' in table
			&& 'schema' in table
			&& Object.keys(table).length === 2
		) {
			delete difference.tables[tableKey];
		}
	}

	const enumsEntries = Object.entries(difference.enums);
	const alteredEnums = enumsEntries
		.filter((it) => !(it[0].includes('__added') || it[0].includes('__deleted')))
		.map((it) => {
			const enumEntry = json1.enums[it[0]];
			const { name, schema, values } = enumEntry;

			const sequence = mapArraysDiff(values, it[1].values);
			const addedValues = sequence
				.filter((it) => it.type === 'added')
				.map((it) => {
					return {
						before: it.before,
						value: it.value,
					};
				});
			const deletedValues = sequence
				.filter((it) => it.type === 'removed')
				.map((it) => it.value);

			return { name, schema, addedValues, deletedValues };
		});

	const sequencesEntries = Object.entries(difference.sequences);
	const alteredSequences = sequencesEntries
		.filter((it) => !(it[0].includes('__added') || it[0].includes('__deleted')) && 'values' in it[1])
		.map((it) => {
			return json2.sequences[it[0]];
		});

	const rolesEntries = Object.entries(difference.roles);
	const alteredRoles = rolesEntries
		.filter((it) => !(it[0].includes('__added') || it[0].includes('__deleted')))
		.map((it) => {
			return json2.roles[it[0]];
		});

	const policiesEntries = Object.entries(difference.policies);
	const alteredPolicies = policiesEntries
		.filter((it) => !(it[0].includes('__added') || it[0].includes('__deleted')))
		.map((it) => {
			return json2.policies[it[0]];
		});

	const viewsEntries = Object.entries(difference.views);

	const alteredViews = viewsEntries.filter((it) => !(it[0].includes('__added') || it[0].includes('__deleted'))).map(
		([nameWithSchema, view]) => {
			const deletedWithOption = view.with__deleted;

			const addedWithOption = view.with__added;

			const deletedWith = Object.fromEntries(
				Object.entries(view.with || {}).filter((it) => it[0].endsWith('__deleted')).map(([key, value]) => {
					return [key.replace('__deleted', ''), value];
				}),
			);

			const addedWith = Object.fromEntries(
				Object.entries(view.with || {}).filter((it) => it[0].endsWith('__added')).map(([key, value]) => {
					return [key.replace('__added', ''), value];
				}),
			);

			const alterWith = Object.fromEntries(
				Object.entries(view.with || {}).filter((it) =>
					typeof it[1].__old !== 'undefined' && typeof it[1].__new !== 'undefined'
				).map(
					(it) => {
						return [it[0], it[1].__new];
					},
				),
			);

			const alteredSchema = view.schema;

			const alteredDefinition = view.definition;

			const alteredExisting = view.isExisting;

			const addedTablespace = view.tablespace__added;
			const droppedTablespace = view.tablespace__deleted;
			const alterTablespaceTo = view.tablespace;

			let alteredTablespace;
			if (addedTablespace) alteredTablespace = { __new: addedTablespace, __old: 'pg_default' };
			if (droppedTablespace) alteredTablespace = { __new: 'pg_default', __old: droppedTablespace };
			if (alterTablespaceTo) alteredTablespace = alterTablespaceTo;

			const addedUsing = view.using__added;
			const droppedUsing = view.using__deleted;
			const alterUsingTo = view.using;

			let alteredUsing;
			if (addedUsing) alteredUsing = { __new: addedUsing, __old: 'heap' };
			if (droppedUsing) alteredUsing = { __new: 'heap', __old: droppedUsing };
			if (alterUsingTo) alteredUsing = alterUsingTo;

			const alteredMeta = view.meta;

			return Object.fromEntries(
				Object.entries({
					name: json2.views[nameWithSchema].name,
					schema: json2.views[nameWithSchema].schema,
					// pg
					deletedWithOption: deletedWithOption,
					addedWithOption: addedWithOption,
					deletedWith: Object.keys(deletedWith).length ? deletedWith : undefined,
					addedWith: Object.keys(addedWith).length ? addedWith : undefined,
					alteredWith: Object.keys(alterWith).length ? alterWith : undefined,
					alteredSchema,
					alteredTablespace,
					alteredUsing,
					// mysql
					alteredMeta,
					// common
					alteredDefinition,
					alteredExisting,
				}).filter(([_, value]) => value !== undefined),
			);
		},
	);

	const alteredTablesWithColumns = Object.values(difference.tables).map(
		(table) => {
			return findAlternationsInTable(table);
		},
	);

	return {
		alteredTablesWithColumns,
		alteredEnums,
		alteredSequences,
		alteredRoles,
		alteredViews,
		alteredPolicies,
	};
}

const findAlternationsInTable = (table) => {
	// map each table to have altered, deleted or renamed columns

	// in case no columns were altered, but indexes were
	const columns = table.columns ?? {};

	const altered = Object.keys(columns)
		.filter((it) => !(it.includes('__deleted') || it.includes('__added')))
		.map((it) => {
			return { name: it, ...columns[it] };
		});

	const deletedIndexes = Object.fromEntries(
		Object.entries(table.indexes__deleted || {})
			.concat(
				Object.entries(table.indexes || {}).filter((it) => it[0].includes('__deleted')),
			)
			.map((entry) => [entry[0].replace('__deleted', ''), entry[1]]),
	);

	const addedIndexes = Object.fromEntries(
		Object.entries(table.indexes__added || {})
			.concat(
				Object.entries(table.indexes || {}).filter((it) => it[0].includes('__added')),
			)
			.map((entry) => [entry[0].replace('__added', ''), entry[1]]),
	);

	const alteredIndexes = Object.fromEntries(
		Object.entries(table.indexes || {}).filter((it) => {
			return !it[0].endsWith('__deleted') && !it[0].endsWith('__added');
		}),
	);

	const deletedPolicies = Object.fromEntries(
		Object.entries(table.policies__deleted || {})
			.concat(
				Object.entries(table.policies || {}).filter((it) => it[0].includes('__deleted')),
			)
			.map((entry) => [entry[0].replace('__deleted', ''), entry[1]]),
	);

	const addedPolicies = Object.fromEntries(
		Object.entries(table.policies__added || {})
			.concat(
				Object.entries(table.policies || {}).filter((it) => it[0].includes('__added')),
			)
			.map((entry) => [entry[0].replace('__added', ''), entry[1]]),
	);

	const alteredPolicies = Object.fromEntries(
		Object.entries(table.policies || {}).filter((it) => {
			return !it[0].endsWith('__deleted') && !it[0].endsWith('__added');
		}),
	);

	const deletedForeignKeys = Object.fromEntries(
		Object.entries(table.foreignKeys__deleted || {})
			.concat(
				Object.entries(table.foreignKeys || {}).filter((it) => it[0].includes('__deleted')),
			)
			.map((entry) => [entry[0].replace('__deleted', ''), entry[1]]),
	);

	const addedForeignKeys = Object.fromEntries(
		Object.entries(table.foreignKeys__added || {})
			.concat(
				Object.entries(table.foreignKeys || {}).filter((it) => it[0].includes('__added')),
			)
			.map((entry) => [entry[0].replace('__added', ''), entry[1]]),
	);

	const alteredForeignKeys = Object.fromEntries(
		Object.entries(table.foreignKeys || {})
			.filter(
				(it) => !it[0].endsWith('__added') && !it[0].endsWith('__deleted'),
			)
			.map((entry) => [entry[0], entry[1]]),
	);

	const addedCompositePKs = Object.fromEntries(
		Object.entries(table.compositePrimaryKeys || {}).filter((it) => {
			return it[0].endsWith('__added');
		}),
	);

	const deletedCompositePKs = Object.fromEntries(
		Object.entries(table.compositePrimaryKeys || {}).filter((it) => {
			return it[0].endsWith('__deleted');
		}),
	);

	const alteredCompositePKs = Object.fromEntries(
		Object.entries(table.compositePrimaryKeys || {}).filter((it) => {
			return !it[0].endsWith('__deleted') && !it[0].endsWith('__added');
		}),
	);

	const addedUniqueConstraints = Object.fromEntries(
		Object.entries(table.uniqueConstraints || {}).filter((it) => {
			return it[0].endsWith('__added');
		}),
	);

	const deletedUniqueConstraints = Object.fromEntries(
		Object.entries(table.uniqueConstraints || {}).filter((it) => {
			return it[0].endsWith('__deleted');
		}),
	);

	const alteredUniqueConstraints = Object.fromEntries(
		Object.entries(table.uniqueConstraints || {}).filter((it) => {
			return !it[0].endsWith('__deleted') && !it[0].endsWith('__added');
		}),
	);

	const addedCheckConstraints = Object.fromEntries(
		Object.entries(table.checkConstraints || {}).filter((it) => {
			return it[0].endsWith('__added');
		}),
	);

	const deletedCheckConstraints = Object.fromEntries(
		Object.entries(table.checkConstraints || {}).filter((it) => {
			return it[0].endsWith('__deleted');
		}),
	);

	const alteredCheckConstraints = Object.fromEntries(
		Object.entries(table.checkConstraints || {}).filter((it) => {
			return !it[0].endsWith('__deleted') && !it[0].endsWith('__added');
		}),
	);

	const mappedAltered = altered.map((it) => alternationsInColumn(it)).filter(Boolean);

	return {
		name: table.name,
		schema: table.schema || '',
		altered: mappedAltered,
		addedIndexes,
		deletedIndexes,
		alteredIndexes,
		addedForeignKeys,
		deletedForeignKeys,
		alteredForeignKeys,
		addedCompositePKs,
		deletedCompositePKs,
		alteredCompositePKs,
		addedUniqueConstraints,
		deletedUniqueConstraints,
		alteredUniqueConstraints,
		deletedPolicies,
		addedPolicies,
		alteredPolicies,
		addedCheckConstraints,
		deletedCheckConstraints,
		alteredCheckConstraints,
	};
};

const alternationsInColumn = (column) => {
	const altered = [column];

	const result = altered
		.filter((it) => {
			if ('type' in it && it.type.__old.replace(' (', '(') === it.type.__new.replace(' (', '(')) {
				return false;
			}
			return true;
		})
		.map((it) => {
			if (typeof it.name !== 'string' && '__old' in it.name) {
				// rename
				return {
					...it,
					name: { type: 'changed', old: it.name.__old, new: it.name.__new },
				};
			}
			return it;
		})
		.map((it) => {
			if ('type' in it) {
				// type change
				return {
					...it,
					type: { type: 'changed', old: it.type.__old, new: it.type.__new },
				};
			}
			return it;
		})
		.map((it) => {
			if ('default' in it) {
				return {
					...it,
					default: {
						type: 'changed',
						old: it.default.__old,
						new: it.default.__new,
					},
				};
			}
			if ('default__added' in it) {
				const { default__added, ...others } = it;
				return {
					...others,
					default: { type: 'added', value: it.default__added },
				};
			}
			if ('default__deleted' in it) {
				const { default__deleted, ...others } = it;
				return {
					...others,
					default: { type: 'deleted', value: it.default__deleted },
				};
			}
			return it;
		})
		.map((it) => {
			if ('generated' in it) {
				if ('as' in it.generated && 'type' in it.generated) {
					return {
						...it,
						generated: {
							type: 'changed',
							old: { as: it.generated.as.__old, type: it.generated.type.__old },
							new: { as: it.generated.as.__new, type: it.generated.type.__new },
						},
					};
				} else if ('as' in it.generated) {
					return {
						...it,
						generated: {
							type: 'changed',
							old: { as: it.generated.as.__old },
							new: { as: it.generated.as.__new },
						},
					};
				} else {
					return {
						...it,
						generated: {
							type: 'changed',
							old: { as: it.generated.type.__old },
							new: { as: it.generated.type.__new },
						},
					};
				}
			}
			if ('generated__added' in it) {
				const { generated__added, ...others } = it;
				return {
					...others,
					generated: { type: 'added', value: it.generated__added },
				};
			}
			if ('generated__deleted' in it) {
				const { generated__deleted, ...others } = it;
				return {
					...others,
					generated: { type: 'deleted', value: it.generated__deleted },
				};
			}
			return it;
		})
		.map((it) => {
			if ('identity' in it) {
				return {
					...it,
					identity: {
						type: 'changed',
						old: it.identity.__old,
						new: it.identity.__new,
					},
				};
			}
			if ('identity__added' in it) {
				const { identity__added, ...others } = it;
				return {
					...others,
					identity: { type: 'added', value: it.identity__added },
				};
			}
			if ('identity__deleted' in it) {
				const { identity__deleted, ...others } = it;
				return {
					...others,
					identity: { type: 'deleted', value: it.identity__deleted },
				};
			}
			return it;
		})
		.map((it) => {
			if ('notNull' in it) {
				return {
					...it,
					notNull: {
						type: 'changed',
						old: it.notNull.__old,
						new: it.notNull.__new,
					},
				};
			}
			if ('notNull__added' in it) {
				const { notNull__added, ...others } = it;
				return {
					...others,
					notNull: { type: 'added', value: it.notNull__added },
				};
			}
			if ('notNull__deleted' in it) {
				const { notNull__deleted, ...others } = it;
				return {
					...others,
					notNull: { type: 'deleted', value: it.notNull__deleted },
				};
			}
			return it;
		})
		.map((it) => {
			if ('primaryKey' in it) {
				return {
					...it,
					primaryKey: {
						type: 'changed',
						old: it.primaryKey.__old,
						new: it.primaryKey.__new,
					},
				};
			}
			if ('primaryKey__added' in it) {
				const { notNull__added, ...others } = it;
				return {
					...others,
					primaryKey: { type: 'added', value: it.primaryKey__added },
				};
			}
			if ('primaryKey__deleted' in it) {
				const { notNull__deleted, ...others } = it;
				return {
					...others,
					primaryKey: { type: 'deleted', value: it.primaryKey__deleted },
				};
			}
			return it;
		})
		.map((it) => {
			if ('typeSchema' in it) {
				return {
					...it,
					typeSchema: {
						type: 'changed',
						old: it.typeSchema.__old,
						new: it.typeSchema.__new,
					},
				};
			}
			if ('typeSchema__added' in it) {
				const { typeSchema__added, ...others } = it;
				return {
					...others,
					typeSchema: { type: 'added', value: it.typeSchema__added },
				};
			}
			if ('typeSchema__deleted' in it) {
				const { typeSchema__deleted, ...others } = it;
				return {
					...others,
					typeSchema: { type: 'deleted', value: it.typeSchema__deleted },
				};
			}
			return it;
		})
		.map((it) => {
			if ('onUpdate' in it) {
				return {
					...it,
					onUpdate: {
						type: 'changed',
						old: it.onUpdate.__old,
						new: it.onUpdate.__new,
					},
				};
			}
			if ('onUpdate__added' in it) {
				const { onUpdate__added, ...others } = it;
				return {
					...others,
					onUpdate: { type: 'added', value: it.onUpdate__added },
				};
			}
			if ('onUpdate__deleted' in it) {
				const { onUpdate__deleted, ...others } = it;
				return {
					...others,
					onUpdate: { type: 'deleted', value: it.onUpdate__deleted },
				};
			}
			return it;
		})
		.map((it) => {
			if ('autoincrement' in it) {
				return {
					...it,
					autoincrement: {
						type: 'changed',
						old: it.autoincrement.__old,
						new: it.autoincrement.__new,
					},
				};
			}
			if ('autoincrement__added' in it) {
				const { autoincrement__added, ...others } = it;
				return {
					...others,
					autoincrement: { type: 'added', value: it.autoincrement__added },
				};
			}
			if ('autoincrement__deleted' in it) {
				const { autoincrement__deleted, ...others } = it;
				return {
					...others,
					autoincrement: { type: 'deleted', value: it.autoincrement__deleted },
				};
			}
			return it;
		})
		.map((it) => {
			if ('' in it) {
				return {
					...it,
					autoincrement: {
						type: 'changed',
						old: it.autoincrement.__old,
						new: it.autoincrement.__new,
					},
				};
			}
			if ('autoincrement__added' in it) {
				const { autoincrement__added, ...others } = it;
				return {
					...others,
					autoincrement: { type: 'added', value: it.autoincrement__added },
				};
			}
			if ('autoincrement__deleted' in it) {
				const { autoincrement__deleted, ...others } = it;
				return {
					...others,
					autoincrement: { type: 'deleted', value: it.autoincrement__deleted },
				};
			}
			return it;
		})
		.filter(Boolean);

	return result[0];
};
