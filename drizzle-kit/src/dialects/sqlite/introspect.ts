import { type IntrospectStage, type IntrospectStatus } from '../../cli/views';
import { type SQLiteDB } from '../../utils';
import {
	type CheckConstraint,
	type Column,
	type ForeignKey,
	type Index,
	type PrimaryKey,
	type SqliteEntities,
	type UniqueConstraint,
	type View,
} from './ddl';
import { extractGeneratedColumns, Generated, parseTableSQL, parseViewSQL, sqlTypeFrom } from './grammar';


export const fromDatabase = async (
	db: SQLiteDB,
	tablesFilter: (table: string) => boolean = () => true,
	progressCallback: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void = () => {},
) => {
	const dbColumns = await db.query<{
		table: string;
		name: string;
		columnType: string;
		notNull: number;
		defaultValue: string;
		pk: number;
		seq: number;
		hidden: number;
		sql: string;
		type: 'view' | 'table';
	}>(
		`SELECT 
			m.name as "table", 
			p.name as "name", 
			p.type as "columnType",
			p."notnull" as "notNull", 
			p.dflt_value as "defaultValue",
		  p.pk as pk, p.hidden as hidden,
			m.sql,
			m.type as type
    FROM sqlite_master AS m 
		JOIN pragma_table_xinfo(m.name) AS p
    WHERE 
			(m.type = 'table' OR m.type = 'view')
			and m.tbl_name != 'sqlite_sequence' 
			and m.tbl_name != 'sqlite_stat1' 
			and m.tbl_name != '_litestream_seq' 
			and m.tbl_name != '_litestream_lock' 
			and m.tbl_name != 'libsql_wasm_func_table' 
			and m.tbl_name != '__drizzle_migrations' 
			and m.tbl_name != '_cf_KV';
    `,
	).then((columns) => columns.filter((it) => tablesFilter(it.table)));

	type DBColumn = typeof dbColumns[number];

	const dbTablesWithSequences = await db.query<{
		name: string;
	}>(
		`SELECT * FROM sqlite_master WHERE name != 'sqlite_sequence' 
    and name != 'sqlite_stat1' 
    and name != '_litestream_seq' 
    and name != '_litestream_lock' 
    and tbl_name != '_cf_KV' 
    and sql GLOB '*[ *' || CHAR(9) || CHAR(10) || CHAR(13) || ']AUTOINCREMENT[^'']*';`,
	);

	const dbIndexes = await db.query<{
		table: string;
		sql: string;
		name: string;
		column: string;
		isUnique: number;
		origin: string; // u=auto c=manual
		seq: string;
		cid: number;
	}>(
		`SELECT 
    m.tbl_name as table,
		m.sql,
    il.name as name,
    ii.name as column,
    il.[unique] as isUnique,
		il.origin,
    il.seq,
		ii.cid
FROM sqlite_master AS m,
    pragma_index_list(m.name) AS il,
    pragma_index_info(il.name) AS ii
WHERE 
    m.type = 'table' 
    and m.tbl_name != '_cf_KV';`,
	).then((indexes) => indexes.filter((it) => tablesFilter(it.table)));

	let columnsCount = 0;
	let tablesCount = new Set();
	let indexesCount = 0;
	let foreignKeysCount = 0;
	let checksCount = 0;
	let viewsCount = 0;

	type DBIndex = typeof dbIndexes[number];
	// append primaryKeys by table

	const tableToPk = dbColumns.reduce((acc, it) => {
		const isPrimary = it.pk !== 0;
		if (isPrimary) {
			if (it.table in tableToPk) {
				tableToPk[it.table].push(it.name);
			} else {
				tableToPk[it.table] = [it.name];
			}
		}
		return acc;
	}, {} as { [tname: string]: string[] });

	const tableToGenerated = dbColumns.reduce((acc, it) => {
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

	const tablesToSQL = dbColumns.reduce((acc, it) => {
		if (it.table in acc) return;

		acc[it.table] = it.sql;
		return acc;
	}, {} as Record<string, string>) || {};

	const tables: SqliteEntities['tables'][] = [
		...new Set(dbColumns.filter((it) => it.type === 'table').map((it) => it.table)),
	].map((it) => ({
		entityType: 'tables',
		name: it,
	}));

	const pks: PrimaryKey[] = [];
	for (const [key, value] of Object.entries(tableToPk)) {
		if (value.length === 1) continue;
		pks.push({ entityType: 'pks', table: key, name: `${key}_${value.join('_')}_pk`, columns: value });
	}

	const columns: Column[] = [];
	for (const column of dbColumns) {
		// TODO
		if (column.type !== 'view') {
			columnsCount += 1;
		}

		progressCallback('columns', columnsCount, 'fetching');

		tablesCount.add(column.table);

		progressCallback('tables', tablesCount.size, 'fetching');

		const name = column.name;
		const notNull = column.notNull === 1; // 'YES', 'NO'
		const type = sqlTypeFrom(column.columnType); // varchar(256)
		const isPrimary = column.pk !== 0;

		const columnDefaultValue = column.defaultValue;
		const columnDefault: Column['default'] = columnDefaultValue !== null
			? /^-?[\d.]+(?:e-?\d+)?$/.test(columnDefaultValue)
				? { value: columnDefaultValue, isExpression: true }
				: ['CURRENT_TIME', 'CURRENT_DATE', 'CURRENT_TIMESTAMP'].includes(
						columnDefaultValue,
					)
				? { value: `(${columnDefaultValue})`, isExpression: true }
				: columnDefaultValue === 'false' || columnDefaultValue === 'true'
				? { value: columnDefaultValue, isExpression: true }
				: columnDefaultValue.startsWith("'") && columnDefaultValue.endsWith("'")
				? { value: columnDefaultValue, isExpression: false }
				: { value: `(${columnDefaultValue})`, isExpression: true }
			: null;

		const autoincrement = isPrimary && dbTablesWithSequences.some((it) => it.name === column.table);
		const pk = tableToPk[column.table];
		const primaryKey = isPrimary && pk && pk.length === 1;
		const generated = tableToGenerated[column.table][column.name] || null;

		const tableIndexes = Object.values(tableToIndexColumns[column.table] || {});

		// we can only safely define if column is unique
		const unique = primaryKey
			? null // if pk, no UNIQUE
			: tableIndexes.filter((it) => {
				const idx = it.index;
				// we can only safely define UNIQUE column when there is automatically(origin=u) created unique index on the column(only1)
				return idx.origin === 'u' && idx.isUnique && it.columns.length === 1 && idx.table === column.table
					&& idx.column === column.name;
			}).map((it) => {
				return { name: it.index.name.startsWith(`sqlite_autoindex_`) ? null : it.index.name };
			})[0] || null;

		columns.push({
			entityType: 'columns',
			table: column.table,
			unique,
			default: columnDefault,
			autoincrement,
			name,
			type,
			primaryKey,
			notNull,
			generated,
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
	).then((fks) => fks.filter((it) => tablesFilter(it.tableFrom)));
	type DBFK = typeof dbFKs[number];

	const fksToColumns = dbFKs.reduce((acc, it) => {
		const key = String(it.id);
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

		const { columnsFrom, columnsTo } = fksToColumns[String(fk.id)]!;
		const name = `${fk.tableFrom}_${
			columnsFrom.join(
				'_',
			)
		}_${fk.tableTo}_${columnsTo.join('_')}_fk`;

		fks.push({
			entityType: 'fks',
			table: fk.tableFrom,
			name,
			tableFrom: fk.tableFrom,
			tableTo: fk.tableTo,
			columnsFrom,
			columnsTo,
			onDelete: fk.onDelete,
			onUpdate: fk.onUpdate,
		});
	}

	progressCallback('fks', foreignKeysCount, 'done');

	const indexes: Index[] = [];
	for (const [table, index] of Object.entries(tableToIndexColumns)) {
		const values = Object.values(index);
		for (const { index, columns, where } of values) {
			if (index.origin === 'u') continue;

			indexesCount += 1;
			progressCallback('indexes', indexesCount, 'fetching');

			const origin = index.origin === 'u' ? 'auto' : index.origin === 'c' ? 'manual' : null;
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

	const viewsToColumns = dbColumns.filter((it) => it.type === 'view').reduce((acc, it) => {
		if (it.table in acc) {
			acc[it.table].columns.push(it);
		} else {
			acc[it.table] = { view: { name: it.table, sql: it.sql }, columns: [it] };
		}
		return acc;
	}, {} as Record<string, { view: { name: string; sql: string }; columns: DBColumn[] }>);

	viewsCount = Object.keys(viewsToColumns).length;
	progressCallback('views', viewsCount, 'fetching');

	const views: View[] = [];
	for (const { view } of Object.values(viewsToColumns)) {
		const definition = parseViewSQL(view.sql);

		if (!definition) {
			console.log(`Could not process view ${view.name}:\n${view.sql}`);
			process.exit(1);
		}

		views.push({
			entityType: 'views',
			name: view.name,
			definition,
			isExisting: false,
		});
	}

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
			uniques.push({
				entityType: 'uniques',
				table,
				name: index.name,
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
