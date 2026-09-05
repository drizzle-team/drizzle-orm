import type { IntrospectStage, IntrospectStatus } from '../../cli/views';
import { areStringArraysEqual, type DB } from '../../utils';
import type { EntityFilter } from '../pull-utils';
import { filterMigrationsSchema } from '../utils';
import type {
	CheckConstraint,
	Column,
	ForeignKey,
	Index,
	InterimColumn,
	PrimaryKey,
	SqliteEntities,
	UniqueConstraint,
	View,
	ViewColumn,
} from './ddl';
import type { Generated } from './grammar';
import {
	extractGeneratedColumns,
	nameForForeignKey,
	nameForPk,
	nameForUnique,
	parseDefault,
	parseSqliteDdl,
	parseSqliteFks,
	parseSqliteIndex,
	parseViewSQL,
	sqlTypeFrom,
} from './grammar';

export const fromDatabaseForDrizzle = async (
	db: DB,
	filter: EntityFilter = () => true,
	progressCallback: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void = () => {},
	migrations: {
		table: string;
		schema: string;
	},
) => {
	const res = await fromDatabase(db, filter, progressCallback);
	res.indexes = res.indexes.filter((it) => it.origin !== 'auto');

	filterMigrationsSchema(res, migrations);

	return res;
};

export const fromDatabase = async (
	db: DB,
	filter: EntityFilter,
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
		type: 'table' | 'virtual';
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
			l.type as type
		FROM sqlite_master AS m 
			JOIN pragma_table_list(m.name) AS l
			JOIN pragma_table_xinfo(m.name) AS p
		WHERE 
			(l.type = 'table' OR l.type = 'virtual')
			and m.tbl_name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
			and m.tbl_name NOT LIKE '\\_litestream\\_%' ESCAPE '\\'
			and m.tbl_name NOT LIKE 'libsql\\_%' ESCAPE '\\'
			and m.tbl_name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
			and m.tbl_name NOT LIKE 'd1\\_%' ESCAPE '\\'
		ORDER BY p.cid;
    `,
	).then((columns) => {
		queryCallback('columns', columns, null);
		return columns.filter((it) => filter({ type: 'table', schema: false, name: it.table }));
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
			and m.tbl_name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
			and m.tbl_name NOT LIKE '\\_litestream\\_%' ESCAPE '\\'
			and m.tbl_name NOT LIKE 'libsql\\_%' ESCAPE '\\'
			and m.tbl_name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
			and m.tbl_name NOT LIKE 'd1\\_%' ESCAPE '\\'
		ORDER BY m.name COLLATE NOCASE
		;`,
	).then((views) => {
		queryCallback('views', views, null);
		return views.filter((it) => filter({ type: 'table', schema: false, name: it.name })).map((it): View => {
			const definition = parseViewSQL(it.sql);

			if (!definition) {
				throw new Error(`Could not process view ${it.name}:\n${it.sql}`);
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
				and m.tbl_name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
				and m.tbl_name NOT LIKE '\\_litestream\\_%' ESCAPE '\\'
				and m.tbl_name NOT LIKE 'libsql\\_%' ESCAPE '\\'
				and m.tbl_name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
				and m.tbl_name NOT LIKE 'd1\\_%' ESCAPE '\\'
			ORDER BY m.name COLLATE NOCASE, p.cid;
		`,
		).then((columns) => {
			queryCallback('viewColumns', columns, null);
			return columns.filter((it) => filter({ type: 'table', schema: false, name: it.table }));
		}).catch((error) => {
			queryCallback('viewColumns', [], error);
			throw error;
		});
	} catch {
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
		return tables.filter((it) => filter({ type: 'table', schema: false, name: it.name }));
	}).catch((error) => {
		queryCallback('tablesWithSequences', [], error);
		throw error;
	});

	const dbIndexes = await db.query<{
		table: string;
		name: string;
		sql: string | null; // null for indexes implicitly created by UNIQUE/PRIMARY KEY constraints
		column: string;
		isUnique: number;
		isPartial: number;
		origin: string; // u=auto c=manual pk
		cid: number;
	}>(`
		SELECT
    m.tbl_name    AS "table",
    il.name       AS "name",
    idx.sql       AS "sql",
    ii.name       AS "column",
    il."unique"   AS "isUnique",
    il."partial"  AS "isPartial",
    il.origin     AS "origin",
    ii.cid        AS "cid"
FROM sqlite_master AS m
JOIN pragma_index_list(m.name)  AS il
JOIN pragma_index_info(il.name) AS ii
LEFT JOIN sqlite_master AS idx
       ON idx.type = 'index'
      AND idx.name = il.name
WHERE m.type = 'table'
  AND m.tbl_name != '_cf_KV'
ORDER BY m.name COLLATE NOCASE, il.seq, ii.seqno;
	`).then((indexes) => {
		queryCallback('indexes', indexes, null);
		return indexes.filter((it) => filter({ type: 'table', schema: false, name: it.table }));
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
	type TableIndex = {
		index: DBIndex;
		columns: { value: string; isExpression: boolean }[];
		where: string | null;
	};
	// append primaryKeys by table

	const tableToParsedFks = dbTableColumns.reduce((acc, it) => {
		if (!acc[it.table]) {
			acc[it.table] = parseSqliteFks(it.sql);
		}
		return acc;
	}, {} as {
		[tname: string]: {
			name: string | null;
			toTable: string;
			fromTable: string;
			fromColumns: string[];
			toColumns: string[];
		}[];
	});

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

	const tableToIndexColumns = dbIndexes.reduce((acc, it) => {
		const indexes = acc[it.table] ??= {};
		// implicit indexes have no ddl of their own, they have neither expressions nor a predicate
		const parsed = it.sql ? parseSqliteIndex(it.sql) : { columns: [], where: null };
		const index = indexes[it.name] ??= { index: it, columns: [], where: it.isPartial ? parsed.where : null };
		const isExpression = it.cid === -2;

		// `pragma_index_info` reports NULL as a name of an expression column, the ddl has the expression itself
		const value = isExpression ? parsed.columns[index.columns.length] ?? '' : it.column;
		index.columns.push({ value, isExpression });
		return acc;
	}, {} as Record<string, Record<string, TableIndex>>);

	const tablesToSQL = dbTableColumns.reduce((acc, it) => {
		if (it.table in acc) return acc;

		acc[it.table] = it.sql;
		return acc;
	}, {} as Record<string, string>) || {};

	const tableToParsedDdl = Object.entries(tablesToSQL).reduce((acc, [table, sql]) => {
		acc[table] = parseSqliteDdl(sql);
		return acc;
	}, {} as Record<string, ReturnType<typeof parseSqliteDdl>>);

	const tables: SqliteEntities['tables'][] = [
		...new Set(dbTableColumns.map((it) => it.table)),
	].map((it) => ({
		entityType: 'tables',
		name: it,
	}));

	const pks: PrimaryKey[] = [];
	for (const [key, value] of Object.entries(tableToPk)) {
		if (value.length === 1) continue;

		const parsed = tableToParsedDdl[key];

		pks.push({
			entityType: 'pks',
			table: key,
			name: parsed.pk.name ?? nameForPk(key),
			columns: value,
			nameExplicit: false,
		});
	}

	const columns: InterimColumn[] = [];
	for (const column of dbTableColumns) {
		columnsCount += 1;

		progressCallback('columns', columnsCount, 'fetching');

		tablesCount.add(column.table);

		progressCallback('tables', tablesCount.size, 'fetching');

		const name = column.name;
		const notNull = column.notNull === 1; // 'YES', 'NO'
		const type = sqlTypeFrom(column.columnType); // varchar(256)
		const isPrimary = column.pk !== 0;

		const columnDefault: Column['default'] = parseDefault(column.columnType, column.defaultValue);
		const autoincrement = isPrimary && dbTablesWithSequences.some((it) => it.name === column.table);
		const pk = tableToPk[column.table];
		const primaryKey = isPrimary && pk && pk.length === 1;
		const generated = tableToGenerated[column.table]?.[column.name] || null;

		const tableIndexes = Object.values(tableToIndexColumns[column.table] || {});
		// implicit indexes carry no sql of their own, their constraint is declared in the table ddl
		const parsedDdl = tableToParsedDdl[column.table];

		const unique = primaryKey
			? null // if pk, no UNIQUE
			: tableIndexes.filter((it) => {
				const idx = it.index;

				// we can only safely define UNIQUE column when there is automatically(origin=u) created unique index on the column(only 1)
				return idx.origin === 'u' && idx.isUnique && it.columns.length === 1 && idx.table === column.table
					&& idx.column === column.name;
			}).map((it) => {
				const constraint = parsedDdl.uniques.find((parsedUnique) =>
					areStringArraysEqual(it.columns.map((indexCol) => indexCol.value), parsedUnique.columns)
				);
				if (!constraint) return null;

				return { name: constraint.name };
			})[0] || null;

		const pkName = !primaryKey
			? null // if pk, no UNIQUE
			: tableIndexes.filter((it) => {
				const idx = it.index;

				// we can only safely define PRIMARY KEY column when there is automatically(origin=pk) created unique index on the column(only 1)
				return idx.origin === 'pk' && idx.isUnique && it.columns.length === 1 && idx.table === column.table
					&& idx.column === column.name;
			}).map(() => {
				if (parsedDdl.pk.columns.length > 1) return;

				const constraint = areStringArraysEqual(parsedDdl.pk.columns, [name]) ? parsedDdl.pk : null;
				if (!constraint) return { name: null };

				return { name: constraint.name };
			})[0] || null;

		columns.push({
			entityType: 'columns',
			table: column.table,
			default: columnDefault,
			autoincrement,
			name,
			pk: primaryKey,
			pkName: pkName?.name ?? nameForPk(column.table),
			type,
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
		`WITH pks AS (
		  SELECT m.name AS tbl, ti.name AS col, ti.pk AS pk
		  FROM sqlite_master m
		  JOIN pragma_table_info(m.name) ti
		  WHERE m.type = 'table' AND ti.pk > 0
		)
		SELECT
		  m.name                    AS "tableFrom",
		  f.id                      AS "id",
		  f."table"                 AS "tableTo",
		  f."from"                  AS "from",
		  f.seq                     AS "seq",
		  COALESCE(f."to", p.col)   AS "to",
		  f.on_update               AS "onUpdate",
		  f.on_delete               AS "onDelete"
		FROM sqlite_master m
		JOIN pragma_foreign_key_list(m.name) f
		LEFT JOIN pks p
		       ON p.tbl = f."table"
		      AND p.pk  = f.seq + 1        -- pk is 1-based, seq is 0-based
		WHERE m.type = 'table'
		  AND m.name NOT LIKE 'sqlite_%'
		ORDER BY m.name, f.id, f.seq;`,
	).then((fks) => {
		queryCallback('fks', fks, null);
		return fks.filter((it) => filter({ type: 'table', schema: false, name: it.tableFrom }));
	}).catch((error) => {
		queryCallback('fks', [], error);
		throw error;
	});
	type DBFK = typeof dbFKs[number];

	const fksToColumns = dbFKs.reduce((acc, it) => {
		if (!it.to) {
			throw Error(
				`Table ${chalk.underline(it.tableTo)} has no primary key, so the foreign key from ${
					chalk.underline(`${it.tableFrom}.${it.from}`)
				} to ${chalk.underline(it.tableTo)} cannot be resolved`,
			);
		}
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

	for (const entity of Object.values(fksToColumns)) {
		foreignKeysCount += 1;
		progressCallback('fks', foreignKeysCount, 'fetching');

		const { columnsFrom, columnsTo, fk } = entity;

		const parsedFks = tableToParsedFks[fk.tableFrom] as typeof tableToParsedFks[string] | undefined;

		const constraint = parsedFks?.find((it) =>
			areStringArraysEqual(it.fromColumns, columnsFrom) && areStringArraysEqual(it.toColumns, columnsTo)
			&& (it.toTable === fk.tableTo) && (it.fromTable === fk.tableFrom)
		);

		let name: string;
		if (!constraint) {
			name = nameForForeignKey({ table: fk.tableFrom, columns: columnsFrom, tableTo: fk.tableTo, columnsTo });
		} else {
			name = constraint.name
				?? nameForForeignKey({ table: fk.tableFrom, columns: columnsFrom, tableTo: fk.tableTo, columnsTo });
		}

		fks.push({
			entityType: 'fks',
			table: fk.tableFrom,
			name: name,
			tableTo: fk.tableTo,
			columns: columnsFrom,
			columnsTo: columnsTo,
			nameExplicit: true,
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
	for (const table of Object.keys(tablesToSQL)) {
		for (const it of tableToParsedDdl[table].checks) {
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
		// only implicitly created(origin=u) indexes stand for a UNIQUE constraint declared in the table ddl
		const implicitUniques = Object.values(item).filter((it) => it.index.isUnique && it.index.origin === 'u');
		for (const { columns } of implicitUniques) {
			if (columns.length === 1) continue;

			const constraint = tableToParsedDdl[table].uniques.find((parsedUnique) =>
				areStringArraysEqual(columns.map((it) => it.value), parsedUnique.columns)
			);
			if (!constraint) continue;

			uniques.push({
				entityType: 'uniques',
				table,
				name: constraint.name ?? nameForUnique(table, columns.map((it) => it.value)),
				nameExplicit: true,
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
