import { type IntrospectStage, type IntrospectStatus } from '../../cli/views';
import { type DB } from '../../utils';
import {
	type CheckConstraint,
	type Column,
	type ForeignKey,
	type Index,
	InterimColumn,
	type PrimaryKey,
	type SqliteEntities,
	type UniqueConstraint,
	type View,
	type ViewColumn,
} from './ddl';
import {
	extractGeneratedColumns,
	Generated,
	nameForForeignKey,
	nameForUnique,
	parseDefault,
	parseTableSQL,
	parseViewSQL,
	sqlTypeFrom,
} from './grammar';

export const fromDatabaseForDrizzle = async (
	db: DB,
	tablesFilter: (table: string) => boolean = () => true,
	progressCallback: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void = () => {},
) => {
	const res = await fromDatabase(db, tablesFilter, progressCallback);
	res.indexes = res.indexes.filter((it) => it.origin !== 'auto');
	res.uniques = res.uniques.filter((it) => it.origin !== 'auto');

	return res;
};

export const fromDatabase = async (
	db: DB,
	tablesFilter: (table: string) => boolean = () => true,
	progressCallback: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void = () => {},
	queryCallback: (
		id: string,
		rows: Record<string, unknown>[],
		error: Error | null,
	) => void = () => {},
) => {
	// TODO: fetch tables and views list with system filter from grammar
	const dbTableColumns = await db.query<{
		table: string;
		name: string;
		columnType: string;
		notNull: number;
		defaultValue: string;
		pk: number;
		hidden: number;
		sql: string;
		type: 'table' | 'view';
	}>(
		`SELECT 
			m.name as "table", 
			p.name as "name", 
			p.type as "columnType",
			p."notnull" as "notNull", 
			p.dflt_value as "defaultValue",
			p.pk as pk,
			p.hidden as hidden,
			m.sql,
			m.type as type
		FROM sqlite_master AS m 
			JOIN pragma_table_xinfo(m.name) AS p
		WHERE 
			m.type = 'table'
			and m.tbl_name != '__drizzle_migrations' 
			and m.tbl_name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
			and m.tbl_name NOT LIKE '\\_litestream\\_%' ESCAPE '\\'
			and m.tbl_name NOT LIKE 'libsql\\_%' ESCAPE '\\'
			and m.tbl_name  NOT LIKE 'sqlite\\_%' ESCAPE '\\'
		ORDER BY m.name COLLATE NOCASE, p.cid
		;
    `,
	).then((columns) => {
		queryCallback('columns', columns, null);
		return columns.filter((it) => tablesFilter(it.table));
	}).catch((error) => {
		queryCallback('columns', [], error);
		throw error;
	});

	const views = await db.query<{
		name: string;
		sql: string;
	}>(
		`SELECT
			m.name as "name",
			m.sql
		FROM sqlite_master AS m
			WHERE
			m.type = 'view'
			and m.tbl_name != '__drizzle_migrations'
			and m.tbl_name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
			and m.tbl_name NOT LIKE '\\_litestream\\_%' ESCAPE '\\'
			and m.tbl_name NOT LIKE 'libsql\\_%' ESCAPE '\\'
			and m.tbl_name  NOT LIKE 'sqlite\\_%' ESCAPE '\\'
		ORDER BY m.name COLLATE NOCASE
		;`,
	).then((views) => {
		queryCallback('views', views, null);
		return views.filter((it) => tablesFilter(it.name)).map((it): View => {
			const definition = parseViewSQL(it.sql);

			if (!definition) {
				console.log(`Could not process view ${it.name}:\n${it.sql}`);
				process.exit(1);
			}

			return {
				entityType: 'views',
				name: it.name,
				definition,
				isExisting: false,
				error: null,
			};
		});
	}).catch((error) => {
		queryCallback('views', [], error);
		throw error;
	});

	let dbViewColumns: {
		table: string;
		name: string;
		columnType: string;
		notNull: number;
		defaultValue: string;
		pk: number;
		hidden: number;
	}[] = [];
	try {
		dbViewColumns = await db.query<{
			table: string;
			name: string;
			columnType: string;
			notNull: number;
			defaultValue: string;
			pk: number;
			hidden: number;
			sql: string;
			type: 'view';
		}>(
			`SELECT 
				m.name as "table", 
				p.name as "name", 
				p.type as "columnType",
				p."notnull" as "notNull", 
				p.dflt_value as "defaultValue",
				p.pk as pk,
				p.hidden as hidden,
				m.sql,
				m.type as type
			FROM sqlite_master AS m 
				JOIN pragma_table_xinfo(m.name) AS p
			WHERE 
				m.type = 'view'
				and m.tbl_name != '__drizzle_migrations' 
				and m.tbl_name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
				and m.tbl_name NOT LIKE '\\_litestream\\_%' ESCAPE '\\'
				and m.tbl_name NOT LIKE 'libsql\\_%' ESCAPE '\\'
				and m.tbl_name  NOT LIKE 'sqlite\\_%' ESCAPE '\\'
			ORDER BY m.name COLLATE NOCASE, p.cid
			;
		`,
		).then((columns) => {
			queryCallback('viewColumns', columns, null);
			return columns.filter((it) => tablesFilter(it.table));
		}).catch((error) => {
			queryCallback('viewColumns', [], error);
			throw error;
		});
	} catch (_) {
		for (const view of views) {
			try {
				const viewColumns = await db.query<{
					table: string;
					name: string;
					columnType: string;
					notNull: number;
					defaultValue: string;
					pk: number;
					hidden: number;
				}>(
					`SELECT 
						'${view.name}' as "table",
						p.name as "name", 
						p.type as "columnType",
						p."notnull" as "notNull", 
						p.dflt_value as "defaultValue",
						p.pk as pk,
						p.hidden as hidden
					FROM pragma_table_xinfo(${view.name}) AS p
					ORDER BY p.name COLLATE NOCASE, p.cid
					;
					`,
				).then((columns) => {
					queryCallback(`viewColumns:${view.name}`, columns, null);
					return columns;
				}).catch((error) => {
					queryCallback(`viewColumns:${view.name}`, [], error);
					throw error;
				});
				dbViewColumns.push(...viewColumns);
			} catch (error) {
				const errorMessage = (error as Error).message;
				const viewIndex = views.findIndex((v) => v.name === view.name);
				views[viewIndex] = {
					...views[viewIndex],
					error: errorMessage,
				};
			}
		}
	}

	const dbTablesWithSequences = await db.query<{
		name: string;
	}>(
		`SELECT * FROM sqlite_master WHERE name != 'sqlite_sequence' 
    and name != 'sqlite_stat1' 
    and name != '_litestream_seq' 
    and name != '_litestream_lock' 
    and tbl_name != '_cf_KV' 
    and sql GLOB '*[ *' || CHAR(9) || CHAR(10) || CHAR(13) || ']AUTOINCREMENT[^'']*';`,
	).then((tables) => {
		queryCallback('tablesWithSequences', tables, null);
		return tables.filter((it) => tablesFilter(it.name));
	}).catch((error) => {
		queryCallback('tablesWithSequences', [], error);
		throw error;
	});

	const dbIndexes = await db.query<{
		table: string;
		sql: string;
		name: string;
		column: string;
		isUnique: number;
		origin: string; // u=auto c=manual pk
		seq: string;
		cid: number;
	}>(`
		SELECT 
			m.tbl_name as "table",
			m.sql,
			il.name as "name",
			ii.name as "column",
			il.[unique] as "isUnique",
			il.origin,
			il.seq,
			ii.cid
		FROM sqlite_master AS m,
			pragma_index_list(m.name) AS il,
			pragma_index_info(il.name) AS ii
		WHERE 
			m.type = 'table' 
			and m.tbl_name != '_cf_KV'
		ORDER BY m.name COLLATE NOCASE;
	`).then((indexes) => {
		queryCallback('indexes', indexes, null);
		return indexes.filter((it) => tablesFilter(it.table));
	}).catch((error) => {
		queryCallback('indexes', [], error);
		throw error;
	});

	let columnsCount = 0;
	let tablesCount = new Set();
	let indexesCount = 0;
	let foreignKeysCount = 0;
	let checksCount = 0;
	let viewsCount = 0;

	type DBIndex = typeof dbIndexes[number];
	// append primaryKeys by table

	const tableToPk = dbTableColumns.reduce((acc, it) => {
		const isPrimary = it.pk !== 0;
		if (isPrimary) {
			if (it.table in acc) {
				acc[it.table].push(it.name);
			} else {
				acc[it.table] = [it.name];
			}
		}
		return acc;
	}, {} as { [tname: string]: string[] });

	const tableToGenerated = dbTableColumns.reduce((acc, it) => {
		if (it.hidden !== 2 && it.hidden !== 3) return acc;
		acc[it.table] = extractGeneratedColumns(it.sql);
		return acc;
	}, {} as Record<string, Record<string, Generated>>);

	const tableToIndexColumns = dbIndexes.reduce(
		(acc, it) => {
			const whereIdx = it.sql.toLowerCase().indexOf(' where ');
			const where = whereIdx < 0 ? null : it.sql.slice(whereIdx + 7);
			const column = { value: it.column, isExpression: it.cid === -2 };
			if (it.table in acc) {
				if (it.name in acc[it.table]) {
					const idx = acc[it.table][it.name];
					idx.columns.push(column);
				} else {
					const idx = { index: it, columns: [column], where };
					acc[it.table][it.name] = idx;
				}
			} else {
				const idx = { index: it, columns: [column], where };
				acc[it.table] = { [it.name]: idx };
			}
			return acc;
		},
		{} as Record<
			string,
			Record<string, { index: DBIndex; columns: { value: string; isExpression: boolean }[]; where: string | null }>
		>,
	);

	const tablesToSQL = dbTableColumns.reduce((acc, it) => {
		if (it.table in acc) return acc;

		acc[it.table] = it.sql;
		return acc;
	}, {} as Record<string, string>) || {};

	const tables: SqliteEntities['tables'][] = [
		...new Set(dbTableColumns.filter((it) => it.type === 'table').map((it) => it.table)),
	].map((it) => ({
		entityType: 'tables',
		name: it,
	}));

	const pks: PrimaryKey[] = [];
	for (const [key, value] of Object.entries(tableToPk)) {
		if (value.length === 1) continue;
		// TODO: if we want to explicitely handle name - we need to parse SQL definition
		pks.push({ entityType: 'pks', table: key, name: '', columns: value });
	}

	const columns: InterimColumn[] = [];
	for (const column of dbTableColumns.filter((it) => it.type === 'table')) {
		columnsCount += 1;

		progressCallback('columns', columnsCount, 'fetching');

		tablesCount.add(column.table);

		progressCallback('tables', tablesCount.size, 'fetching');

		const name = column.name;
		const notNull = column.notNull === 1; // 'YES', 'NO'
		const type = sqlTypeFrom(column.columnType); // varchar(256)
		const isPrimary = column.pk !== 0;

		const columnDefault: Column['default'] = parseDefault(column.defaultValue);
		const autoincrement = isPrimary && dbTablesWithSequences.some((it) => it.name === column.table);
		const pk = tableToPk[column.table];
		const primaryKey = isPrimary && pk && pk.length === 1;
		const generated = tableToGenerated[column.table]?.[column.name] || null;

		const tableIndexes = Object.values(tableToIndexColumns[column.table] || {});

		const unique = primaryKey
			? null // if pk, no UNIQUE
			: tableIndexes.filter((it) => {
				const idx = it.index;
				// we can only safely define UNIQUE column when there is automatically(origin=u) created unique index on the column(only 1)
				return idx.origin === 'u' && idx.isUnique && it.columns.length === 1 && idx.table === column.table
					&& idx.column === column.name;
			}).map((it) => {
				return { name: nameForUnique(column.table, it.columns.filter((x) => !x.isExpression).map((x) => x.value)) };
			})[0] || null;

		columns.push({
			entityType: 'columns',
			table: column.table,
			default: columnDefault,
			autoincrement,
			name,
			type,
			primaryKey,
			notNull,
			generated,
			isUnique: !!unique,
			uniqueName: unique?.name ?? null,
		});
	}

	progressCallback('columns', columnsCount, 'done');
	progressCallback('tables', tablesCount.size, 'done');

	const dbFKs = await db.query<{
		tableFrom: string;
		tableTo: string;
		from: string;
		to: string;
		onUpdate: string;
		onDelete: string;
		seq: number;
		id: number;
	}>(
		`SELECT 
			m.name as "tableFrom",
			f.id as "id", 
			f."table" as "tableTo", 
			f."from", 
			f."to",
		  f."on_update" as "onUpdate", 
			f."on_delete" as "onDelete", 
			f.seq as "seq"
		FROM sqlite_master m, pragma_foreign_key_list(m.name) as f 
		WHERE m.tbl_name != '_cf_KV';`,
	).then((fks) => {
		queryCallback('fks', fks, null);
		return fks.filter((it) => tablesFilter(it.tableFrom));
	}).catch((error) => {
		queryCallback('fks', [], error);
		throw error;
	});
	type DBFK = typeof dbFKs[number];

	const fksToColumns = dbFKs.reduce((acc, it) => {
		const key = `${it.tableFrom}:${it.id}`;
		if (key in acc) {
			acc[key].columnsFrom.push(it.from);
			acc[key].columnsTo.push(it.to);
		} else {
			acc[key] = {
				fk: it,
				columnsFrom: [it.from],
				columnsTo: [it.to],
			};
		}
		return acc;
	}, {} as Record<string, { fk: DBFK; columnsFrom: string[]; columnsTo: string[] }>);

	const fks: ForeignKey[] = [];
	for (const fk of dbFKs) {
		foreignKeysCount += 1;
		progressCallback('fks', foreignKeysCount, 'fetching');

		const { columnsFrom, columnsTo } = fksToColumns[`${fk.tableFrom}:${fk.id}`]!;
		const name = nameForForeignKey({ table: fk.tableFrom, columns: columnsFrom, tableTo: fk.tableTo, columnsTo });

		fks.push({
			entityType: 'fks',
			table: fk.tableFrom,
			name,
			tableTo: fk.tableTo,
			columns: columnsFrom,
			columnsTo,
			onDelete: fk.onDelete ?? 'NO ACTION',
			onUpdate: fk.onUpdate ?? 'NO ACTION',
		});
	}

	progressCallback('fks', foreignKeysCount, 'done');

	const indexes: Index[] = [];
	for (const [table, index] of Object.entries(tableToIndexColumns)) {
		const values = Object.values(index);
		for (const { index, columns, where } of values) {
			indexesCount += 1;
			progressCallback('indexes', indexesCount, 'fetching');

			const origin = index.origin === 'u' || index.origin === 'pk' ? 'auto' : index.origin === 'c' ? 'manual' : null;
			if (!origin) throw new Error(`Index with unexpected origin: ${index.origin}`);

			indexes.push({
				entityType: 'indexes',
				table,
				name: index.name,
				isUnique: index.isUnique === 1,
				origin,
				where,
				columns,
			});
		}
	}
	progressCallback('indexes', indexesCount, 'done');
	progressCallback('enums', 0, 'done');

	const viewsToColumns = dbViewColumns.reduce((acc, it) => {
		const column: ViewColumn = {
			view: it.table,
			name: it.name,
			type: sqlTypeFrom(it.columnType),
			notNull: it.notNull === 1,
		};
		if (it.table in acc) {
			acc[it.table].push(column);
		} else {
			acc[it.table] = [column];
		}
		return acc;
	}, {} as Record<string, ViewColumn[]>);

	viewsCount = Object.keys(viewsToColumns).length;
	progressCallback('views', viewsCount, 'fetching');

	progressCallback('views', viewsCount, 'done');

	let checkCounter = 0;
	const checkConstraints: Record<string, CheckConstraint> = {};

	const checks: CheckConstraint[] = [];
	for (const [table, sql] of Object.entries(tablesToSQL)) {
		const res = parseTableSQL(sql);
		for (const it of res.checks) {
			const { name, value } = it;

			let checkName = name ? name : `${table}_check_${++checkCounter}`;
			checks.push({ entityType: 'checks', table, name: checkName, value: value.trim() });
		}

		checksCount += Object.values(checkConstraints).length;
		progressCallback('checks', checksCount, 'fetching');
	}

	progressCallback('checks', checksCount, 'done');

	const uniques: UniqueConstraint[] = [];
	for (const [table, item] of Object.entries(tableToIndexColumns)) {
		for (const { columns, index } of Object.values(item).filter((it) => it.index.isUnique)) {
			if (columns.length === 1) continue;
			if (columns.some((it) => it.isExpression)) {
				throw new Error(`unexpected unique index '${index.name}' with expression value: ${index.sql}`);
			}

			const origin = index.origin === 'u' || index.origin === 'pk' ? 'auto' : index.origin === 'c' ? 'manual' : null;
			if (!origin) throw new Error(`Index with unexpected origin: ${index.origin}`);

			const name = nameForUnique(table, columns.filter((it) => !it.isExpression).map((it) => it.value));

			uniques.push({
				entityType: 'uniques',
				table,
				name: name,
				origin: origin,
				columns: columns.map((it) => it.value),
			});
		}
	}

	return {
		tables,
		columns,
		pks,
		fks,
		indexes,
		checks,
		uniques,
		views,
		viewsToColumns,
	};
};
