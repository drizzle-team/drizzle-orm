import chalk from 'chalk';
import { render } from 'hanji';
import type { Resolver } from 'src/dialects/common';
import type { RenamePropmtItem } from './views';
import { isRenamePromptItem, ResolveSelect } from './views';

export const resolver = <T extends { name: string; schema?: string; table?: string }>(
	entity:
		| 'schema'
		| 'enum'
		| 'table'
		| 'column'
		| 'sequence'
		| 'view'
		| 'privilege'
		| 'policy'
		| 'role'
		| 'check'
		| 'index'
		| 'unique'
		| 'primary key'
		| 'foreign key'
		| 'default',
	defaultSchema: 'public' | 'dbo' = 'public',
): Resolver<T> => {
	return async (it: { created: T[]; deleted: T[] }) => {
		const { created, deleted } = it;

		if (created.length === 0 || deleted.length === 0) {
			return { created, deleted, renamedOrMoved: [] };
		}

		const result: {
			created: T[];
			deleted: T[];
			renamedOrMoved: { from: T; to: T }[];
		} = { created: [], deleted: [], renamedOrMoved: [] };
		let index = 0;
		let leftMissing = [...deleted];
		do {
			const newItem = created[index];
			const renames: RenamePropmtItem<T>[] = leftMissing.map((it) => {
				return { from: it, to: newItem };
			});

			const promptData: (RenamePropmtItem<T> | T)[] = [newItem, ...renames];
			const { status, data } = await render(new ResolveSelect(newItem, promptData, entity, defaultSchema));

			if (status === 'aborted') {
				console.error('ERROR');
				process.exit(1);
			}

			if (isRenamePromptItem(data)) {
				const to = data.to;

				const schemaFromPrefix = newItem.schema ? newItem.schema !== defaultSchema ? `${newItem.schema}.` : '' : '';

				const tableFromPrefix = newItem.table ? `${newItem.table}.` : '';

				const fromEntity = `${schemaFromPrefix}${tableFromPrefix}${data.from.name}`;

				const schemaToPrefix = to.schema ? to.schema !== defaultSchema ? `${to.schema}.` : '' : '';
				const tableToPrefix = to.table ? `${to.table}.` : '';
				const toEntity = `${schemaToPrefix}${tableToPrefix}${to.name}`;

				console.log(
					`${chalk.yellow('~')} ${fromEntity} › ${toEntity} ${
						chalk.gray(
							`${entity} will be renamed/moved`,
						)
					}`,
				);

				result.renamedOrMoved.push(data);

				delete leftMissing[leftMissing.indexOf(data.from)];
				leftMissing = leftMissing.filter(Boolean);
			} else {
				console.log(
					`${chalk.green('+')} ${newItem.name} ${
						chalk.gray(
							`${entity} will be created`,
						)
					}`,
				);
				result.created.push(newItem);
			}
			index += 1;
		} while (index < created.length);
		console.log(chalk.gray(`--- all ${entity} conflicts resolved ---\n`));
		result.deleted.push(...leftMissing);
		return result;
	};
};
