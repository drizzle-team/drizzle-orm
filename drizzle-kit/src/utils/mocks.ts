export const mockResolver =
	<T extends { name: string; table?: string; schema?: string }>(renames: Set<string>) =>
	async (it: {
		created: T[];
		deleted: T[];
	}): Promise<{ created: T[]; deleted: T[]; renamedOrMoved: { from: T; to: T }[] }> => {
		const { created, deleted } = it;

		if (created.length === 0 || deleted.length === 0 || renames.size === 0) {
			return { created, deleted, renamedOrMoved: [] };
		}

		let createdItems = [...created];
		let deletedItems = [...deleted];

		const renamedOrMoved: { from: T; to: T }[] = [];
		for (let rename of renames) {
			const [from, to] = rename.split('->');

			const idxFrom = deletedItems.findIndex((it) => {
				const schema = it.schema ? `${it.schema}.` : '';
				const table = it.table ? `${it.table}.` : '';
				const key = `${schema}${table}${it.name}`;
				return key === from;
			});

			if (idxFrom >= 0) {
				const idxTo = createdItems.findIndex((it) => {
					const schema = it.schema ? `${it.schema}.` : '';
					const table = it.table ? `${it.table}.` : '';
					const key = `${schema}${table}${it.name}`;
					return key === to;
				});

				if (idxTo < 0) throw new Error(`unexpected`);

				renamedOrMoved.push({
					from: deletedItems[idxFrom],
					to: createdItems[idxTo],
				});

				delete createdItems[idxTo];
				delete deletedItems[idxFrom];

				createdItems = createdItems.filter(Boolean);
				deletedItems = deletedItems.filter(Boolean);
			}
		}
		return { created: createdItems, deleted: deletedItems, renamedOrMoved };
	};
