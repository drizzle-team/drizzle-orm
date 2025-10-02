import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createDDL } from 'src/dialects/mysql/ddl';
import { trimChar } from 'src/utils';
import type { MysqlSchema, MysqlSnapshot } from '../../dialects/mysql/snapshot';
import { Journal } from '../../utils';

export const upMysqlHandler = (out: string) => {
	// if there is meta folder - and there is a journal - it's version <8
	const metaPath = join(out, 'meta');
	const journalPath = join(metaPath, '_journal.json');
	if (existsSync(metaPath) && existsSync(journalPath)) {
		const journal: Journal = JSON.parse(readFileSync(journalPath).toString());
		if (Number(journal.version) < 8) {
			for (const entry of journal.entries) {
				const snapshotPrefix = entry.tag.split('_')[0];
				const oldSnapshot = readFileSync(join(metaPath, `${snapshotPrefix}_snapshot.json`));
				const oldSql = readFileSync(join(out, `${entry.tag}.sql`));

				writeFileSync(join(out, `${entry.tag}/snapshot.json`), oldSnapshot);
				writeFileSync(join(out, `${entry.tag}/migration.sql`), oldSql);

				unlinkSync(join(out, `${entry.tag}.sql`));
			}

			rmSync(metaPath);
		}
	}
};

export const upToV6 = (it: Record<string, any>): MysqlSnapshot => {
	const json = it as MysqlSchema;

	const hints = [] as string[];

	const ddl = createDDL();

	for (const table of Object.values(json.tables)) {
		ddl.tables.push({ name: table.name });

		for (const column of Object.values(table.columns)) {
			ddl.columns.push({
				table: table.name,
				name: column.name,
				type: column.type,
				notNull: column.notNull,
				default: column.default,
				autoIncrement: column.autoincrement ?? false,
				onUpdateNow: column.onUpdate ?? false,
				generated: column.generated,
				// TODO: @AleksandrSherman check
				charSet: null,
				collation: null,
				onUpdateNowFsp: null,
			});
		}
	}
	for (const table of Object.values(json.tables)) {
		for (const index of Object.values(table.indexes)) {
			/* legacy columns mapper
				const uniqueString = unsquashedUnique.columns
					.map((it) => {
						return internals?.indexes
							? internals?.indexes[unsquashedUnique.name]?.columns[it]
									?.isExpression
								? it
								: `\`${it}\``
							: `\`${it}\``;
					})
					.join(',');
			 */

			const columns = index.columns.map((x) => {
				const nameToCheck = trimChar(x, '`');
				const isColumn = !!ddl.columns.one({ table: table.name, name: nameToCheck });
				return { value: x, isExpression: !isColumn };
			});

			ddl.indexes.push({
				table: table.name,
				name: index.name,
				columns,
				algorithm: index.algorithm ?? null,
				isUnique: index.isUnique,
				lock: index.lock ?? null,
				using: index.using ?? null,
				nameExplicit: true,
			});
		}

		for (const unique of Object.values(table.uniqueConstraints)) {
			/* legacy columns mapper
				const uniqueString = unsquashedUnique.columns
					.map((it) => {
						return internals?.indexes
							? internals?.indexes[unsquashedUnique.name]?.columns[it]
									?.isExpression
								? it
								: `\`${it}\``
							: `\`${it}\``;
					})
					.join(',');
			 */
			const columns = unique.columns.map((x) => {
				const nameToCheck = trimChar(x, '`');
				const isColumn = !!ddl.columns.one({ table: table.name, name: nameToCheck });
				return { value: x, isExpression: !isColumn };
			});

			const nameImplicit = `${table.name}_${unique.columns.join('_')}_unique` === unique.name
				|| `${table.name}_${unique.columns.join('_')}` === unique.name;

			ddl.indexes.push({
				table: table.name,
				name: unique.name,
				columns,
				algorithm: null,
				isUnique: true,
				lock: null,
				using: null,
				nameExplicit: !nameImplicit,
			});
		}

		for (const fk of Object.values(table.foreignKeys)) {
			const isNameImplicit =
				`${fk.tableFrom}_${fk.columnsFrom.join('_')}_${fk.tableTo}_${fk.columnsTo.join('_')}_fk` === fk.name;

			ddl.fks.push({
				table: table.name,
				name: fk.name,
				columns: fk.columnsFrom,
				columnsTo: fk.columnsTo,
				tableTo: fk.tableTo,
				onUpdate: fk.onUpdate?.toUpperCase() as any ?? null,
				onDelete: fk.onDelete?.toUpperCase() as any ?? null,
				nameExplicit: !isNameImplicit,
			});
		}

		for (const check of Object.values(table.checkConstraint)) {
			ddl.checks.push({
				table: table.name,
				name: check.name,
				value: check.value,
				nameExplicit: true,
			});
		}

		for (const pk of Object.values(table.compositePrimaryKeys)) {
			const nameImplicit = `${table.name}_${pk.columns.join('_')}_pk` === pk.name
				|| `${table.name}_${pk.columns.join('_')}` === pk.name;

			ddl.pks.push({
				table: table.name,
				name: pk.name,
				columns: pk.columns,
				nameExplicit: !nameImplicit,
			});
		}
	}

	for (const view of Object.values(json.views)) {
		ddl.views.push({
			name: view.name,
			algorithm: view.algorithm ?? null,
			sqlSecurity: view.sqlSecurity ?? null,
			withCheckOption: view.withCheckOption ?? null,
			definition: view.definition!,
		});
	}

	return {
		version: '6',
		id: json.id,
		prevId: json.prevId,
		dialect: 'mysql',
		ddl: ddl.entities.list(),
		renames: [],
	};
};
