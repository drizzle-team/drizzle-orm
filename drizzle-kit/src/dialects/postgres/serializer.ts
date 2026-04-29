import type { CheckHandlerResult } from '../../cli/commands/check';
import type { CasingType } from '../../cli/validations/common';
import { humanLog, postgresSchemaError, postgresSchemaWarning } from '../../cli/views';
import { assertUnreachable } from '../../utils';
import type { PostgresDDL } from './ddl';
import { createDDL, fromEntities, interimToDDL } from './ddl';
import { fromDrizzleSchema, prepareFromSchemaFiles } from './drizzle';
import type { PostgresSnapshot } from './snapshot';
import { drySnapshot, snapshotValidator } from './snapshot';
import type { JsonStatement } from './statements';

export const prepareSnapshot = async (
	snapshots: string[],
	filenames: string[],
	casing: CasingType | undefined,
	checkResult?: CheckHandlerResult,
): Promise<{
	ddlPrev: PostgresDDL;
	ddlCur: PostgresDDL;
	snapshot: PostgresSnapshot;
	snapshotPrev: PostgresSnapshot;
	custom: PostgresSnapshot;
}> => {
	const { readFileSync } = await import('fs');
	const { randomUUID } = await import('crypto');
	const latestSnapshot = snapshots.length === 0
		? drySnapshot
		: snapshotValidator.strict(
			JSON.parse(readFileSync(snapshots[snapshots.length - 1]).toString()),
		);

	const branchParentSnapshot = checkResult?.parentSnapshot
		? snapshotValidator.strict(
			checkResult.parentSnapshot as Record<string, unknown>,
		)
		: null;
	const branchStatements = (checkResult?.statements ?? []) as JsonStatement[];
	const useBranchParent = branchParentSnapshot !== null && branchStatements.length > 0;
	const mergeLeafIds = (checkResult?.leafIds?.length ?? 0) > 1 ? checkResult?.leafIds : undefined;

	const prevSnapshot = useBranchParent
		? generateLatestSnapshot(branchParentSnapshot, branchStatements)
		: latestSnapshot;

	const ddlPrev = createDDL();
	for (const entry of prevSnapshot.ddl) {
		ddlPrev.entities.push(entry);
	}
	const res = await prepareFromSchemaFiles(filenames);

	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema, errors, warnings } = fromDrizzleSchema(
		res,
		casing,
		() => true,
	);

	if (warnings.length > 0) {
		humanLog(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		humanLog(errors.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { ddl: ddlCur, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		humanLog(errors2.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const id = randomUUID();
	const prevIds = mergeLeafIds ?? [prevSnapshot.id];

	const snapshot = {
		version: '8',
		dialect: 'postgres',
		id,
		prevIds,
		ddl: ddlCur.entities.list(),
		renames: [],
	} satisfies PostgresSnapshot;

	const {
		id: _ignoredId,
		prevIds: _ignoredPrevIds,
		...prevRest
	} = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: PostgresSnapshot = {
		id,
		prevIds,
		...prevRest,
	};

	return { ddlPrev, ddlCur, snapshot, snapshotPrev: prevSnapshot, custom };
};

// takes parent snapshot and statements
// applies statements to the snapshot and returns new snapshot
export function generateLatestSnapshot(
	snapshot: PostgresSnapshot,
	statements: JsonStatement[],
): PostgresSnapshot {
	const ddl = fromEntities(snapshot.ddl);

	/**
	 * Ex.:
	 * statement: {
		type: 'add_column',
		column: {
			'$diffType': 'create',
			entityType: 'columns',
			...
		},
		isPK: false,
		isCompositePK: false
	}
	 */
	const clearMetaFields = <T>(value: T): T => {
		if (!value || typeof value !== 'object') {
			return value;
		}

		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).filter(
				([key]) => !key.startsWith('$'),
			),
		) as T;
	};

	const push = (entity: { push: (row: unknown) => unknown }, row: unknown) => {
		entity.push(clearMetaFields(row));
	};
	const del = (
		entity: { delete: (where?: unknown) => unknown },
		where: unknown,
	) => {
		entity.delete(clearMetaFields(where));
	};
	const replace = (
		entity: {
			delete: (where?: unknown) => unknown;
			push: (row: unknown) => unknown;
		},
		left: unknown,
		right: unknown,
	) => {
		del(entity, left);
		push(entity, right);
	};

	for (const statement of statements) {
		switch (statement.type) {
			case 'create_table':
				const table = statement.table;

				ddl.tables.push({
					name: table.name,
					schema: table.schema,
					isRlsEnabled: table.isRlsEnabled,
				});
				for (const column of table.columns) {
					ddl.columns.push(column);
				}
				for (const index of table.indexes) {
					ddl.indexes.push(index);
				}
				if (table.pk) {
					ddl.pks.push(table.pk);
				}
				for (const fk of table.fks) {
					ddl.fks.push(fk);
				}
				for (const unique of table.uniques) {
					ddl.uniques.push(unique);
				}
				for (const check of table.checks) {
					ddl.checks.push(check);
				}
				for (const policy of table.policies) {
					ddl.policies.push(policy);
				}

				break;
			case 'drop_table': {
				const table = statement.table;

				const where = { schema: table.schema, table: table.name } as const;
				ddl.tables.delete({ schema: table.schema, name: table.name });
				ddl.columns.delete(where);
				ddl.indexes.delete(where);
				ddl.pks.delete(where);
				ddl.fks.delete(where);
				ddl.uniques.delete(where);
				ddl.checks.delete(where);
				ddl.policies.delete(where);
				ddl.privileges.delete(where);
				break;
			}
			case 'rename_table':
				/**
				 * prepareStatement('rename_table', {
							schema: it.from.schema,
							from: it.from.name,
							to: it.to.name,
						})
				 */
				ddl.tables.update({
					set: {
						name: statement.to,
					},
					where: {
						name: statement.from,
						schema: statement.schema,
					},
				});

				ddl.fks.update({
					where: { schema: statement.schema, table: statement.from },
					set: { table: statement.to },
				});
				ddl.fks.update({
					where: { schemaTo: statement.schema, tableTo: statement.from },
					set: { tableTo: statement.to },
				});

				ddl.entities.update({
					where: { schema: statement.schema, table: statement.from },
					set: { table: statement.to },
				});

				break;
			case 'move_table':
				// rename of table comes first
				/**
				 * prepareStatement('move_table', {
							name: it.to.name, // rename of table comes first
							from: it.from.schema,
							to: it.to.schema,
						})
				 */
				ddl.tables.update({
					set: {
						schema: statement.to,
					},
					where: {
						schema: statement.from,
						name: statement.name,
					},
				});

				ddl.fks.update({
					where: { schema: statement.from, table: statement.name },
					set: { table: statement.to },
				});
				ddl.fks.update({
					where: { schemaTo: statement.from, tableTo: statement.name },
					set: { tableTo: statement.to },
				});

				ddl.entities.update({
					where: { schema: statement.from, table: statement.name },
					set: { table: statement.to },
				});

				break;
			case 'add_column':
				push(ddl.columns, statement.column);
				break;
			case 'drop_column':
				del(ddl.columns, statement.column);
				break;
			case 'rename_column':
				ddl.columns.update({
					where: {
						schema: statement.from.schema,
						table: statement.from.table,
						name: statement.from.name,
					},
					set: { name: statement.to.name },
				});
				ddl.indexes.update({
					where: { schema: statement.from.schema, table: statement.from.table },
					set: {
						columns: (column) => {
							if (
								!column.isExpression
								&& column.value === statement.from.name
							) {
								return { ...column, value: statement.to.name };
							}
							return column;
						},
					},
				});
				ddl.pks.update({
					where: { schema: statement.from.schema, table: statement.from.table },
					set: {
						columns: (column) => column === statement.from.name ? statement.to.name : column,
					},
				});
				ddl.fks.update({
					where: { schema: statement.from.schema, table: statement.from.table },
					set: {
						columns: (column) => column === statement.from.name ? statement.to.name : column,
						columnsTo: (column) => column === statement.from.name ? statement.to.name : column,
					},
				});
				ddl.uniques.update({
					where: { schema: statement.from.schema, table: statement.from.table },
					set: {
						columns: (column) => column === statement.from.name ? statement.to.name : column,
					},
				});
				break;
			case 'alter_column':
				replace(ddl.columns, statement.diff.$left, statement.to);
				break;
			case 'recreate_column':
				replace(ddl.columns, statement.diff.$left, statement.diff.$right);
				break;

			case 'create_index':
				push(ddl.indexes, statement.index);
				break;
			case 'drop_index':
				del(ddl.indexes, statement.index);
				break;
			case 'rename_index':
				ddl.indexes.update({
					where: { schema: statement.schema, name: statement.from },
					set: { name: statement.to },
				});
				break;
			case 'recreate_index':
				replace(ddl.indexes, statement.diff.$left, statement.index);
				break;

			case 'add_pk':
				push(ddl.pks, statement.pk);
				for (const columnName of statement.pk.columns) {
					ddl.columns.update({
						where: {
							name: columnName,
						},
						set: { notNull: true },
					});
				}

				break;
			case 'drop_pk':
				del(ddl.pks, statement.pk);
				break;
			case 'alter_pk':
				ddl.pks.delete(statement.diff.$left);
				if (!statement.deleted) {
					ddl.pks.push(statement.pk);
				}
				break;

			case 'create_fk':
				push(ddl.fks, statement.fk);
				break;
			case 'drop_fk':
				del(ddl.fks, statement.fk);
				break;
			case 'recreate_fk':
				replace(ddl.fks, statement.diff.$left, statement.fk);
				break;

			case 'add_unique':
				push(ddl.uniques, statement.unique);
				break;
			case 'drop_unique':
				del(ddl.uniques, statement.unique);
				break;
			case 'alter_unique':
				replace(ddl.uniques, statement.diff.$left, statement.diff.$right);
				break;

			case 'add_check':
				push(ddl.checks, statement.check);
				break;
			case 'drop_check':
				del(ddl.checks, statement.check);
				break;
			case 'alter_check':
				replace(ddl.checks, statement.diff.$left, statement.diff.$right);
				break;

			case 'rename_constraint':
				ddl.pks.update({
					where: {
						schema: statement.schema,
						table: statement.table,
						name: statement.from,
					},
					set: { name: statement.to },
				});
				ddl.fks.update({
					where: {
						schema: statement.schema,
						table: statement.table,
						name: statement.from,
					},
					set: { name: statement.to },
				});
				ddl.uniques.update({
					where: {
						schema: statement.schema,
						table: statement.table,
						name: statement.from,
					},
					set: { name: statement.to },
				});
				ddl.checks.update({
					where: {
						schema: statement.schema,
						table: statement.table,
						name: statement.from,
					},
					set: { name: statement.to },
				});
				break;

			case 'create_schema':
				ddl.schemas.push({ name: statement.name });
				break;
			case 'drop_schema':
				ddl.schemas.delete({ name: statement.name });
				ddl.tables.delete({ schema: statement.name });
				ddl.enums.delete({ schema: statement.name });
				ddl.columns.delete({ schema: statement.name });
				ddl.indexes.delete({ schema: statement.name });
				ddl.fks.delete({ schema: statement.name });
				ddl.pks.delete({ schema: statement.name });
				ddl.uniques.delete({ schema: statement.name });
				ddl.checks.delete({ schema: statement.name });
				ddl.sequences.delete({ schema: statement.name });
				ddl.policies.delete({ schema: statement.name });
				ddl.privileges.delete({ schema: statement.name });
				ddl.views.delete({ schema: statement.name });
				break;
			case 'rename_schema':
				ddl.schemas.update({
					where: { name: statement.from.name },
					set: { name: statement.to.name },
				});
				ddl.tables.update({
					where: { schema: statement.from.name },
					set: { schema: statement.to.name },
				});
				ddl.enums.update({
					where: { schema: statement.from.name },
					set: { schema: statement.to.name },
				});
				ddl.columns.update({
					where: { schema: statement.from.name },
					set: { schema: statement.to.name },
				});
				ddl.indexes.update({
					where: { schema: statement.from.name },
					set: { schema: statement.to.name },
				});
				ddl.fks.update({
					where: { schema: statement.from.name },
					set: { schema: statement.to.name },
				});
				ddl.fks.update({
					where: { schemaTo: statement.from.name },
					set: { schemaTo: statement.to.name },
				});
				ddl.pks.update({
					where: { schema: statement.from.name },
					set: { schema: statement.to.name },
				});
				ddl.uniques.update({
					where: { schema: statement.from.name },
					set: { schema: statement.to.name },
				});
				ddl.checks.update({
					where: { schema: statement.from.name },
					set: { schema: statement.to.name },
				});
				ddl.sequences.update({
					where: { schema: statement.from.name },
					set: { schema: statement.to.name },
				});
				ddl.policies.update({
					where: { schema: statement.from.name },
					set: { schema: statement.to.name },
				});
				ddl.privileges.update({
					where: { schema: statement.from.name },
					set: { schema: statement.to.name },
				});
				ddl.views.update({
					where: { schema: statement.from.name },
					set: { schema: statement.to.name },
				});
				break;

			case 'create_enum':
				push(ddl.enums, statement.enum);
				break;
			case 'drop_enum':
				del(ddl.enums, statement.enum);
				break;
			case 'rename_enum':
				ddl.enums.update({
					where: { schema: statement.schema, name: statement.from },
					set: { name: statement.to },
				});
				ddl.columns.update({
					where: {
						schema: statement.schema,
						type: statement.from,
						typeSchema: statement.schema,
					},
					set: { type: statement.to },
				});
				break;
			case 'move_enum':
				ddl.enums.update({
					where: {
						schema: statement.from.schema ?? 'public',
						name: statement.from.name,
					},
					set: {
						schema: statement.to.schema ?? 'public',
						name: statement.to.name,
					},
				});
				ddl.columns.update({
					where: {
						typeSchema: statement.from.schema ?? 'public',
						name: statement.from.name,
					},
					set: {
						typeSchema: statement.to.schema ?? 'public',
					},
				});
				break;
			case 'alter_enum': {
				// When merging commutative branches, multiple alter_enum statements
				// for the same enum may be applied sequentially. Each statement's
				// `from`/`to` reflects the diff from the common parent, so the 2nd
				// statement's `to` wouldn't include values added by the 1st branch.
				// Instead of replacing the whole enum, we apply the diff incrementally:
				// find the current enum by identity (name + schema) and merge in the
				// added values from this statement's diff.
				const identity = {
					name: statement.from.name,
					schema: statement.from.schema,
				};
				const existing = ddl.enums.one(identity);
				if (!existing) {
					push(ddl.enums, statement.to);
					break;
				}

				const values = [...existing.values];
				for (const d of statement.diff) {
					if (d.type !== 'added' || values.includes(d.value)) continue;

					const insertAt = d.beforeValue !== undefined ? values.indexOf(d.beforeValue) : -1;
					if (insertAt !== -1) {
						values.splice(insertAt, 0, d.value);
					} else {
						values.push(d.value);
					}
				}
				ddl.enums.update({ where: identity, set: { values } });
				break;
			}
			case 'recreate_enum':
				// recreate_enum is used when values are removed, which requires a full
				// replacement. Delete by identity to handle the case where a prior
				// commutative branch may have already modified the enum values.
				ddl.enums.delete({
					name: statement.from.name,
					schema: statement.from.schema,
				});
				push(ddl.enums, statement.to);
				break;
			case 'alter_type_drop_value':
				ddl.enums.update({
					where: { schema: statement.enum.schema, name: statement.enum.name },
					set: { values: statement.enum.values },
				});
				break;

			case 'create_sequence':
				push(ddl.sequences, statement.sequence);
				break;
			case 'drop_sequence':
				del(ddl.sequences, statement.sequence);
				break;
			case 'rename_sequence':
				ddl.sequences.update({
					where: { schema: statement.from.schema, name: statement.from.name },
					set: { name: statement.to.name },
				});
				break;
			case 'move_sequence':
				ddl.sequences.update({
					where: {
						schema: statement.from.schema ?? 'public',
						name: statement.from.name,
					},
					set: {
						schema: statement.to.schema ?? 'public',
						name: statement.to.name,
					},
				});
				break;
			case 'alter_sequence':
				replace(ddl.sequences, statement.diff.$left, statement.sequence);
				break;

			case 'create_policy':
				push(ddl.policies, statement.policy);
				break;
			case 'drop_policy':
				del(ddl.policies, statement.policy);
				break;
			case 'rename_policy':
				ddl.policies.update({
					where: {
						schema: statement.from.schema,
						table: statement.from.table,
						name: statement.from.name,
					},
					set: { name: statement.to.name },
				});
				break;
			case 'alter_policy':
				replace(ddl.policies, statement.diff.$left, statement.policy);
				break;
			case 'recreate_policy':
				replace(ddl.policies, statement.diff.$left, statement.policy);
				break;
			case 'alter_rls':
				ddl.tables.update({
					where: { schema: statement.schema, name: statement.name },
					set: { isRlsEnabled: statement.isRlsEnabled },
				});
				break;

			case 'create_role':
				push(ddl.roles, statement.role);
				break;
			case 'drop_role':
				del(ddl.roles, statement.role);
				break;
			case 'rename_role':
				ddl.roles.update({
					where: { name: statement.from.name },
					set: { name: statement.to.name },
				});
				ddl.privileges.update({
					where: { grantor: statement.from.name },
					set: { grantor: statement.to.name },
				});
				ddl.privileges.update({
					where: { grantee: statement.from.name },
					set: { grantee: statement.to.name },
				});
				ddl.policies.update({
					where: {},
					set: {
						roles: (role) => role === statement.from.name ? statement.to.name : role,
					},
				});
				break;
			case 'alter_role':
				replace(ddl.roles, statement.diff.$left, statement.role);
				break;

			case 'grant_privilege':
				push(ddl.privileges, statement.privilege);
				break;
			case 'revoke_privilege':
				del(ddl.privileges, statement.privilege);
				break;
			case 'regrant_privilege':
				replace(ddl.privileges, statement.diff.$left, statement.privilege);
				break;

			case 'create_view':
				push(ddl.views, statement.view);
				break;
			case 'drop_view':
				del(ddl.views, statement.view);
				break;
			case 'rename_view':
				ddl.views.update({
					where: { schema: statement.from.schema, name: statement.from.name },
					set: { name: statement.to.name },
				});
				break;
			case 'move_view':
				ddl.views.update({
					where: { schema: statement.fromSchema, name: statement.view.name },
					set: { schema: statement.toSchema, name: statement.view.name },
				});
				break;
			case 'alter_view':
				replace(ddl.views, statement.diff.$left, statement.view);
				break;

			default:
				assertUnreachable(statement);
		}
	}

	return {
		...snapshot,
		ddl: ddl.entities.list(),
	};
}
