import chalk from 'chalk';
import { render } from 'hanji';
import type { Resolver } from 'src/dialects/common';
import { isJsonMode } from './context';
import { InvalidHintsCliError } from './errors';
import { tuplesEqual } from './hints';
import type { HintsHandler, IdFor, RenameCreateHintKind } from './hints';
import type { RenamePromptItem } from './views';
import { humanLog, isRenamePromptItem, ResolveSelect } from './views';

type PromptEntityBase = { name: string; schema?: string; table?: string };

const entityId = <K extends RenameCreateHintKind>(
	kind: K,
	entity: PromptEntityBase,
	defaultSchema: 'dbo' | 'public',
): IdFor<K> => {
	switch (kind) {
		case 'schema':
			return [entity.name] as unknown as IdFor<K>;
		case 'role':
			return [entity.name] as unknown as IdFor<K>;
		case 'table':
		case 'enum':
		case 'sequence':
		case 'view':
			return [entity.schema ?? defaultSchema, entity.name] as unknown as IdFor<K>;
		case 'column':
		case 'default':
		case 'policy':
		case 'check':
		case 'index':
		case 'unique':
		case 'primary key':
		case 'foreign key': {
			if (typeof entity.table !== 'string') {
				throw new Error(`Expected ${kind} resolver entity to include a table name`);
			}
			return [entity.schema ?? defaultSchema, entity.table, entity.name] as unknown as IdFor<K>;
		}
		case 'privilege': {
			const record = entity as Record<string, unknown>;
			const required = (property: string): string => {
				const value = record[property];
				if (typeof value !== 'string') {
					throw new Error(`Expected ${kind} resolver entity to include a string ${property} field`);
				}
				return value;
			};
			if (typeof entity.table !== 'string') {
				throw new Error(`Expected ${kind} resolver entity to include a table name`);
			}
			return [
				required('grantor'),
				required('grantee'),
				entity.schema ?? defaultSchema,
				entity.table,
				required('type'),
			] as unknown as IdFor<K>;
		}
	}
};

export const resolver = <T extends PromptEntityBase>(
	entity: RenameCreateHintKind,
	defaultSchema: 'public' | 'dbo' = 'public',
	hints?: HintsHandler,
): Resolver<T> => {
	/**
	 * Resolves rename-or-create ambiguity for one entity kind by comparing the
	 * created and deleted sides of a diff.
	 *
	 * JSON mode and TTY mode follow different control flows: JSON mode consults
	 * pre-supplied hints and records any missing hints without prompting, while
	 * TTY mode interactively asks the user to choose the resolution.
	 *
	 * Returns the resolved diff sets along with only the missing-hint items that
	 * were added during this resolver invocation.
	 */
	return async (it: { created: T[]; deleted: T[] }) => {
		const { created, deleted } = it;

		if (created.length === 0 || deleted.length === 0) {
			return { resolved: { created, deleted, renamedOrMoved: [] }, unresolved: [] };
		}

		const createResult = () => ({
			created: [] as T[],
			deleted: [] as T[],
			renamedOrMoved: [] as { from: T; to: T }[],
		});

		const resolveJsonMode = async () => {
			const kind = entity;

			if (!hints) {
				throw new Error(`Internal error: resolver(${entity}) was called in JSON mode without a HintsHandler`);
			}

			const result = createResult();
			let index = 0;
			let leftMissing = [...deleted];
			const unresolvedOffset = hints.missingHints.length;

			do {
				const newItem = created[index]!;
				const newItemId = entityId(kind, newItem, defaultSchema);
				const renameHint = hints.matchRename(kind, newItemId);
				const createHint = hints.matchCreate(kind, newItemId);
				const renameSource = renameHint
					? leftMissing.find((item) => tuplesEqual(entityId(kind, item, defaultSchema), renameHint.from))
					: undefined;

				if (renameSource) {
					applySelection({ from: renameSource, to: newItem }, newItem, leftMissing, result, entity, defaultSchema);
					leftMissing = leftMissing.filter(Boolean);
					index += 1;
					continue;
				}

				if (renameHint) {
					throw new InvalidHintsCliError(
						`rename hint's \`from\` ${JSON.stringify(renameHint.from)} doesn't match any deleted ${kind}`,
						{ kind, from: [...renameHint.from] },
					);
				}

				if (!createHint && leftMissing.length > 0) {
					hints.pushMissingHint(kind, newItemId);
				}

				applySelection(newItem, newItem, leftMissing, result, entity, defaultSchema);
				index += 1;
			} while (index < created.length);

			// Any deleted entities left over were not matched during this resolution pass.
			humanLog(chalk.gray(`--- all ${entity} conflicts resolved ---\n`));
			result.deleted.push(...leftMissing);

			return {
				resolved: result,
				unresolved: hints.missingHints.slice(unresolvedOffset),
			};
		};

		const resolveTtyMode = async () => {
			const result = createResult();
			let index = 0;
			let leftMissing = [...deleted];

			do {
				const newItem = created[index]!;

				// Present the new entity plus every possible rename candidate to the user.
				const renames: RenamePromptItem<T>[] = leftMissing.map((item) => ({ from: item, to: newItem }));
				const promptData: (RenamePromptItem<T> | T)[] = [newItem, ...renames];
				const { status, data } = await render(new ResolveSelect(newItem, promptData, entity, defaultSchema));

				// Preserve the existing abort behavior for interactive runs.
				if (status === 'aborted') {
					console.error('ERROR');
					process.exit(1);
				}

				// Apply the selected rename or keep the entity as a create.
				applySelection(data, newItem, leftMissing, result, entity, defaultSchema);
				leftMissing = leftMissing.filter(Boolean);
				index += 1;
			} while (index < created.length);

			// Any deleted entities still present were not chosen during prompting.
			humanLog(chalk.gray(`--- all ${entity} conflicts resolved ---\n`));
			result.deleted.push(...leftMissing);

			return {
				resolved: result,
				unresolved: [],
			};
		};

		return isJsonMode() ? resolveJsonMode() : resolveTtyMode();
	};
};

const applySelection = <T extends PromptEntityBase>(
	selection: RenamePromptItem<T> | T,
	newItem: T,
	leftMissing: T[],
	result: {
		created: T[];
		deleted: T[];
		renamedOrMoved: { from: T; to: T }[];
	},
	entity: RenameCreateHintKind,
	defaultSchema: 'dbo' | 'public',
): void => {
	if (isRenamePromptItem(selection)) {
		const to = selection.to;

		const schemaFromPrefix = newItem.schema ? newItem.schema !== defaultSchema ? `${newItem.schema}.` : '' : '';
		const tableFromPrefix = newItem.table ? `${newItem.table}.` : '';
		const fromEntity = `${schemaFromPrefix}${tableFromPrefix}${selection.from.name}`;

		const schemaToPrefix = to.schema ? to.schema !== defaultSchema ? `${to.schema}.` : '' : '';
		const tableToPrefix = to.table ? `${to.table}.` : '';
		const toEntity = `${schemaToPrefix}${tableToPrefix}${to.name}`;

		humanLog(
			`${chalk.yellow('~')} ${fromEntity} › ${toEntity} ${chalk.gray(`${entity} will be renamed/moved`)}`,
		);

		result.renamedOrMoved.push(selection);
		const idx = leftMissing.indexOf(selection.from);
		if (idx === -1) {
			throw new Error(
				`applySelection: rename source not present in leftMissing for ${entity} ${selection.from.name}`,
			);
		}
		delete leftMissing[idx];
		return;
	}

	humanLog(`${chalk.green('+')} ${newItem.name} ${chalk.gray(`${entity} will be created`)}`);
	result.created.push(newItem);
};
