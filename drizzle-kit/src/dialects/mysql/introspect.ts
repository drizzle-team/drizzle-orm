import type { IntrospectStage, IntrospectStatus } from 'src/cli/views';
import { DB } from '../../utils';
import { parseParams } from '../utils';
import { ForeignKey, Index, InterimSchema, PrimaryKey } from './ddl';
import { parseDefaultValue } from './grammar';

export const fromDatabaseForDrizzle = async (
	db: DB,
	schema: string,
	tablesFilter: (schema: string, table: string) => boolean = (table) => true,
	progressCallback: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void = () => {},
): Promise<InterimSchema> => {
	const res = await fromDatabase(db, schema, tablesFilter, progressCallback);
	res.indexes = res.indexes.filter((x) => {
		let skip = x.isUnique === true && x.columns.length === 1 && x.columns[0].isExpression === false;
		skip &&= res.columns.some((c) => c.type === 'serial' && c.table === x.table && c.name === x.columns[0].value);

		skip ||= res.fks.some((fk) => x.table === fk.table && x.name === fk.name);
		return !skip;
	});
	return res;
};

export const fromDatabase = async (
	db: DB,
	schema: string,
	tablesFilter: (schema: string, table: string) => boolean = () => true,
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
): Promise<InterimSchema> => {
	const res: InterimSchema = {
		tables: [],
		columns: [],
		pks: [],
		fks: [],
		checks: [],
		indexes: [],
		views: [],
		viewColumns: [],
	};

	// TODO revise: perfomance_schema contains 'users' table
	const tablesAndViews = await db.query<{ name: string; type: 'BASE TABLE' | 'VIEW' }>(`
		SELECT 
			TABLE_NAME as name, 
			TABLE_TYPE as type 
		FROM INFORMATION_SCHEMA.TABLES
		WHERE TABLE_SCHEMA = '${schema}'
		ORDER BY lower(TABLE_NAME);
	`).then((rows) => {
		queryCallback('tables', rows, null);
		return rows.filter((it) => tablesFilter(schema, it.name));
	}).catch((err) => {
		queryCallback('tables', [], err);
		throw err;
	});

	const columns = await db.query(`
		SELECT 
			* 
		FROM information_schema.columns
		WHERE table_schema = '${schema}' and table_name != '__drizzle_migrations'
		ORDER BY lower(table_name), ordinal_position;
	`).then((rows) => {
		queryCallback('columns', rows, null);
		return rows.filter((it) => tablesFilter(schema, it['TABLE_NAME']));
	}).catch((err) => {
		queryCallback('columns', [], err);
		throw err;
	});

	const idxs = await db.query(`
		SELECT 
			* 
		FROM INFORMATION_SCHEMA.STATISTICS
		WHERE INFORMATION_SCHEMA.STATISTICS.TABLE_SCHEMA = '${schema}' 
			AND INFORMATION_SCHEMA.STATISTICS.INDEX_NAME != 'PRIMARY'
		ORDER BY lower(INDEX_NAME);
	`).then((rows) => {
		queryCallback('indexes', rows, null);
		return rows.filter((it) => tablesFilter(schema, it['TABLE_NAME']));
	}).catch((err) => {
		queryCallback('indexes', [], err);
		throw err;
	});

	const filteredTablesAndViews = tablesAndViews.filter((it) => columns.some((x) => x['TABLE_NAME'] === it.name));
	const tables = filteredTablesAndViews.filter((it) => it.type === 'BASE TABLE').map((it) => it.name);
	for (const table of tables) {
		res.tables.push({
			entityType: 'tables',
			name: table,
		});
	}

	let columnsCount = 0;
	let indexesCount = 0;
	let foreignKeysCount = 0;
	let checksCount = 0;
	let viewsCount = 0;

	for (const column of columns.filter((it) => tables.some((x) => x === it['TABLE_NAME']))) {
		columnsCount += 1;
		progressCallback('columns', columnsCount, 'fetching');

		const table = column['TABLE_NAME'];
		const name: string = column['COLUMN_NAME'];
		const isNullable = column['IS_NULLABLE'] === 'YES'; // 'YES', 'NO'
		const columnType = column['COLUMN_TYPE']; // varchar(256)
		const columnDefault: string = column['COLUMN_DEFAULT'] ?? null;
		const collation: string = column['COLLATION_NAME'];
		const charSet: string = column['CHARACTER_SET_NAME'];
		const geenratedExpression: string = column['GENERATION_EXPRESSION'];

		const extra = column['EXTRA'] ?? '';
		const isDefaultAnExpression = extra.includes('DEFAULT_GENERATED'); // 'auto_increment', ''
		const dataType = column['DATA_TYPE']; // varchar
		const isPrimary = column['COLUMN_KEY'] === 'PRI'; // 'PRI', ''
		const numericPrecision = column['NUMERIC_PRECISION'];
		const numericScale = column['NUMERIC_SCALE'];
		const isAutoincrement = extra === 'auto_increment';
		const onUpdateNow: boolean = extra.includes('on update CURRENT_TIMESTAMP');

		const onUpdateNowFspMatch = typeof extra === 'string'
			? extra.match(/\bON\s+UPDATE\s+CURRENT_TIMESTAMP(?:\((\d+)\))?/i)
			: null;
		const onUpdateNowFsp = onUpdateNow && onUpdateNowFspMatch && onUpdateNowFspMatch[1]
			? Number(onUpdateNowFspMatch[1])
			: null;

		let changedType = columnType.replace('decimal(10,0)', 'decimal');

		if (columnType === 'bigint unsigned' && !isNullable && isAutoincrement) {
			const uniqueIdx = idxs.filter(
				(it) =>
					it['COLUMN_NAME'] === name
					&& it['TABLE_NAME'] === table
					&& it['NON_UNIQUE'] === 0,
			);
			if (uniqueIdx && uniqueIdx.length === 1) {
				changedType = columnType.replace('bigint unsigned', 'serial');
			}
		}

		const def = parseDefaultValue(changedType, columnDefault, charSet);

		res.columns.push({
			entityType: 'columns',
			table: table,
			name: name,
			type: changedType,
			isPK: isPrimary, // isPK is an interim flag we use in Drizzle Schema and ignore in database introspect
			notNull: !isNullable,
			autoIncrement: isAutoincrement,
			collation,
			charSet,
			onUpdateNow,
			onUpdateNowFsp,
			default: def,
			generated: geenratedExpression
				? {
					as: geenratedExpression,
					type: extra === 'VIRTUAL GENERATED' ? 'virtual' : 'stored',
				}
				: null,
			isUnique: false,
		});
	}

	const pks = await db.query(`
		SELECT 
			CONSTRAINT_NAME, table_name, column_name, ordinal_position
		FROM information_schema.table_constraints t
		LEFT JOIN information_schema.key_column_usage k USING(constraint_name,table_schema,table_name)
		WHERE t.constraint_type='PRIMARY KEY'
			AND table_name != '__drizzle_migrations'
			AND t.table_schema = '${schema}'
		ORDER BY ordinal_position
	`).then((rows) => {
		queryCallback('pks', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('pks', [], err);
		throw err;
	});

	const tableToPKs = pks.filter((it) => tables.some((x) => x === it['TABLE_NAME'])).reduce<Record<string, PrimaryKey>>(
		(acc, it) => {
			const table: string = it['TABLE_NAME'];
			const column: string = it['COLUMN_NAME'];
			const position: string = it['ordinal_position'];

			if (table in acc) {
				acc[table].columns.push(column);
			} else {
				acc[table] = {
					entityType: 'pks',
					table,
					name: it['CONSTRAINT_NAME'],
					nameExplicit: true,
					columns: [column],
				};
			}
			return acc;
		},
		{} as Record<string, PrimaryKey>,
	);

	for (const pk of Object.values(tableToPKs)) {
		res.pks.push(pk);
	}

	progressCallback('columns', columnsCount, 'done');
	progressCallback('tables', tables.length, 'done');

	const fks = await db.query(`
		SELECT 
			kcu.TABLE_SCHEMA,
			kcu.TABLE_NAME,
			kcu.CONSTRAINT_NAME,
			kcu.COLUMN_NAME,
			kcu.REFERENCED_TABLE_SCHEMA,
			kcu.REFERENCED_TABLE_NAME,
			kcu.REFERENCED_COLUMN_NAME,
			rc.UPDATE_RULE,
			rc.DELETE_RULE
		FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
		LEFT JOIN information_schema.referential_constraints rc ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
		WHERE kcu.TABLE_SCHEMA = '${schema}' 
			AND kcu.CONSTRAINT_NAME != 'PRIMARY' 
			AND kcu.REFERENCED_TABLE_NAME IS NOT NULL;
	`).then((rows) => {
		queryCallback('fks', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('fks', [], err);
		throw err;
	});

	const filteredFKs = fks.filter((it) => tables.some((x) => x === it['TABLE_NAME']));
	const groupedFKs = filteredFKs.reduce<Record<string, ForeignKey>>(
		(acc, it) => {
			const name = it['CONSTRAINT_NAME'];
			const table: string = it['TABLE_NAME'];
			const column: string = it['COLUMN_NAME'];
			const refTable: string = it['REFERENCED_TABLE_NAME'];
			const refColumn: string = it['REFERENCED_COLUMN_NAME'];
			const updateRule: string = it['UPDATE_RULE'];
			const deleteRule: string = it['DELETE_RULE'];

			const key = `${table}:${name}`;

			if (key in acc) {
				const entry = acc[key];
				entry.columns.push(column);
				entry.columnsTo.push(refColumn);
			} else {
				acc[key] = {
					entityType: 'fks',
					name,
					table,
					tableTo: refTable,
					columns: [column],
					columnsTo: [refColumn],
					onDelete: deleteRule?.toLowerCase() as ForeignKey['onUpdate'] ?? 'NO ACTION',
					onUpdate: updateRule?.toLowerCase() as ForeignKey['onUpdate'] ?? 'NO ACTION',
					nameExplicit: true,
				} satisfies ForeignKey;
			}
			return acc;
		},
		{} as Record<string, ForeignKey>,
	);

	for (const fk of Object.values(groupedFKs)) {
		foreignKeysCount += 1;
		progressCallback('fks', foreignKeysCount, 'fetching');
		res.fks.push(fk);
	}

	progressCallback('fks', foreignKeysCount, 'done');

	const groupedIndexes = idxs.reduce<Record<string, Index>>((acc, it) => {
		const name = it['INDEX_NAME'];
		const table = it['TABLE_NAME'];
		const column: string = it['COLUMN_NAME'];
		const isUnique = it['NON_UNIQUE'] === 0;
		const expression = it['EXPRESSION'];

		const key = `${table}:${name}`;

		if (key in acc) {
			const entry = acc[key];
			entry.columns.push({
				value: expression ? expression : column,
				isExpression: !!expression,
			});
		} else {
			acc[key] = {
				entityType: 'indexes',
				table,
				name,
				columns: [{
					value: expression ? expression : column,
					isExpression: !!expression,
				}],
				isUnique,
				algorithm: null,
				lock: null,
				using: null,
				nameExplicit: true,
			} satisfies Index;
		}
		return acc;
	}, {} as Record<string, Index>);

	for (const index of Object.values(groupedIndexes)) {
		res.indexes.push(index);
		indexesCount += 1;
		progressCallback('indexes', indexesCount, 'fetching');
	}

	const views = await db.query(
		`select * from INFORMATION_SCHEMA.VIEWS WHERE table_schema = '${schema}';`,
	);

	viewsCount = views.length;
	progressCallback('views', viewsCount, 'fetching');

	for await (const view of views) {
		const name = view['TABLE_NAME'];
		const definition = view['VIEW_DEFINITION'];

		const checkOption = view['CHECK_OPTION'] as string | undefined;

		const withCheckOption = !checkOption || checkOption === 'NONE'
			? null
			: checkOption.toLowerCase();
		const sqlSecurity = view['SECURITY_TYPE'].toLowerCase();

		const [createSqlStatement] = await db.query(`SHOW CREATE VIEW \`${name}\`;`);
		const algorithmMatch = createSqlStatement['Create View'].match(/ALGORITHM=([^ ]+)/);
		const algorithm = algorithmMatch ? algorithmMatch[1].toLowerCase() : null;

		const viewColumns = columns.filter((it) => it['TABLE_NAME'] === name);

		for (const column of viewColumns) {
			res.viewColumns.push({
				view: name,
				name: column['COLUMN_NAME'],
				notNull: column['IS_NULLABLE'] === 'NO',
				type: column['DATA_TYPE'],
			});
		}

		res.views.push({
			entityType: 'views',
			name,
			definition,
			algorithm: algorithm,
			sqlSecurity,
			withCheckOption: withCheckOption as 'local' | 'cascaded' | null,
		});
	}

	progressCallback('indexes', indexesCount, 'done');
	progressCallback('views', viewsCount, 'done');

	const checks = await db.query(`
		SELECT 
			tc.table_name, 
			tc.constraint_name, 
			cc.check_clause
		FROM information_schema.table_constraints tc
		JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
		WHERE tc.constraint_schema = '${schema}'
			AND tc.constraint_type = 'CHECK';
	`).then((rows) => {
		queryCallback('checks', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('checks', [], err);
		throw err;
	});

	checksCount += checks.length;
	progressCallback('checks', checksCount, 'fetching');

	for (const check of checks.filter((it) => tables.some((x) => x === it['TABLE_NAME']))) {
		const table = check['TABLE_NAME'];
		const name = check['CONSTRAINT_NAME'];
		const value = check['CHECK_CLAUSE'];

		res.checks.push({
			entityType: 'checks',
			table,
			name,
			value,
			nameExplicit: true,
		});
	}

	progressCallback('checks', checksCount, 'done');

	return res;
};
