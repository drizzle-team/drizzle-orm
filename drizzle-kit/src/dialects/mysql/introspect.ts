import type { IntrospectStage, IntrospectStatus } from 'src/cli/views';
import type { DB } from '../../utils';
import type { EntityFilter } from '../pull-utils';
import { batchQuery, filterMigrationsSchema } from '../utils';
import type { ForeignKey, Index, InterimSchema, PrimaryKey } from './ddl';
import { parseDefaultValue } from './grammar';

export const fromDatabaseForDrizzle = async (
	db: DB,
	schema: string,
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
): Promise<InterimSchema> => {
	const res = await fromDatabase(db, schema, filter, progressCallback);
	res.indexes = res.indexes.filter((x) => {
		let skip = x.isUnique === true && x.columns.length === 1 && x.columns[0].isExpression === false;
		skip &&= res.columns.some((c) => c.type === 'serial' && c.table === x.table && c.name === x.columns[0].value);
		skip ||= res.fks.some((fk) => x.table === fk.table && x.name === fk.name);
		return !skip;
	});

	filterMigrationsSchema(res, migrations);

	return res;
};

export const fromDatabase = async (
	db: DB,
	schema: string,
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

	// TABLES

	// TODO revise: perfomance_schema contains 'users' table
	progressCallback('tables', 0, 'fetching');
	const tablesAndViews = await batchQuery<{ name: string; type: 'BASE TABLE' | 'VIEW'; createTime: string }>(
		db,
		({ limit, cursor }) => `
			SELECT 
				TABLE_NAME as name, 
				TABLE_TYPE as type,
				CREATE_TIME as createTime
			FROM INFORMATION_SCHEMA.TABLES
			WHERE TABLE_SCHEMA = '${schema}'
				AND CREATE_TIME IS NOT NULL
				${
			cursor
				? `AND (CREATE_TIME > '${cursor.createTime}' OR (CREATE_TIME = '${cursor.createTime}' AND lower(TABLE_NAME) > '${cursor.name}'))`
				: ''
		}
			ORDER BY CREATE_TIME, lower(TABLE_NAME)
			LIMIT ${limit}
		`,
		(count) => {
			progressCallback('tables', count, 'fetching');
		},
	).then((rows) => {
		queryCallback('tables', rows, null);
		return rows.filter((it) => {
			return filter({ type: 'table', schema: false, name: it.name });
		});
	}).catch((err) => {
		queryCallback('tables', [], err);
		throw err;
	});

	const tableNames = new Set(
		tablesAndViews
			.filter((it) => it.type === 'BASE TABLE')
			.map((it) => it.name),
	);
	for (const table of tableNames) {
		res.tables.push({
			entityType: 'tables',
			name: table,
		});
	}
	progressCallback('tables', res.tables.length, 'done');

	// INDEXES

	progressCallback('indexes', 0, 'fetching');
	const idxs = await db.query(`
		SELECT 
			* 
		FROM INFORMATION_SCHEMA.STATISTICS
		WHERE INFORMATION_SCHEMA.STATISTICS.TABLE_SCHEMA = '${schema}' 
			AND INFORMATION_SCHEMA.STATISTICS.INDEX_NAME != 'PRIMARY'
		ORDER BY seq_in_index ASC;
	`).then((rows) => {
		const filtered = rows.filter((it) => tableNames.has(it['TABLE_NAME']));
		queryCallback('indexes', filtered, null);
		return filtered;
	}).catch((err) => {
		queryCallback('indexes', [], err);
		throw err;
	});

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
	}
	progressCallback('indexes', res.indexes.length, 'done');

	// COLUMNS

	const tableNamesSQL = tablesAndViews.map((t) => `'${t.name}'`).join(',');
	progressCallback('columns', 0, 'fetching');
	const columns = tableNamesSQL
		? await batchQuery<{
			TABLE_NAME: string;
			COLUMN_NAME: string;
			IS_NULLABLE: string;
			COLUMN_TYPE: string;
			DATA_TYPE: string;
			COLUMN_DEFAULT: string | null;
			COLLATION_NAME: string;
			CHARACTER_SET_NAME: string;
			GENERATION_EXPRESSION: string;
			EXTRA: string;
			ORDINAL_POSITION: number;
		}>(
			db,
			({ limit, cursor }) => `
			SELECT 
				TABLE_NAME,
				COLUMN_NAME,
				IS_NULLABLE,
				COLUMN_TYPE,
				DATA_TYPE,
				COLUMN_DEFAULT,
				COLLATION_NAME,
				CHARACTER_SET_NAME,
				GENERATION_EXPRESSION,
				EXTRA,
				ORDINAL_POSITION
			FROM information_schema.columns
			WHERE table_schema = '${schema}'
				AND TABLE_NAME IN (${tableNamesSQL})
				${
				cursor
					? `AND (TABLE_NAME > '${cursor.TABLE_NAME}' OR (TABLE_NAME = '${cursor.TABLE_NAME}' AND ORDINAL_POSITION > ${
						cursor['ORDINAL_POSITION']
					}))`
					: ''
			}
			ORDER BY TABLE_NAME, ORDINAL_POSITION
			LIMIT ${limit}
		`,
			(count) => {
				progressCallback('columns', count, 'fetching');
			},
		).then((rows) => {
			queryCallback('columns', rows, null);
			return rows;
		}).catch((err) => {
			queryCallback('columns', [], err);
			throw err;
		})
		: [];

	const defaultCharSetAndCollation = await db.query<{ default_charset: string; default_collation: string }>(`
		SELECT 
			DEFAULT_CHARACTER_SET_NAME AS default_charset,
			DEFAULT_COLLATION_NAME AS default_collation
		FROM information_schema.SCHEMATA
		WHERE SCHEMA_NAME = '${schema}';
		`);

	for (const column of columns) {
		if (!tableNames.has(column.TABLE_NAME)) continue;

		const table = column['TABLE_NAME'];
		const name: string = column['COLUMN_NAME'];
		const isNullable = column['IS_NULLABLE'] === 'YES'; // 'YES', 'NO'
		const columnType = column['COLUMN_TYPE']; // varchar(256)
		const columnDefault: string | undefined = column['COLUMN_DEFAULT'] ?? undefined;
		const dbCollation: string = column['COLLATION_NAME'];
		const dbCharSet: string = column['CHARACTER_SET_NAME'];
		const geenratedExpression: string = column['GENERATION_EXPRESSION'];

		const extra = column['EXTRA'] ?? '';
		// const isDefaultAnExpression = extra.includes('DEFAULT_GENERATED'); // 'auto_increment', ''
		// const dataType = column['DATA_TYPE']; // varchar
		// const isPrimary = column['COLUMN_KEY'] === 'PRI'; // 'PRI', ''
		// const numericPrecision = column['NUMERIC_PRECISION'];
		// const numericScale = column['NUMERIC_SCALE'];
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

		const def = parseDefaultValue(changedType, columnDefault);

		const { default_charset: defDbCharSet, default_collation: defDbCollation } = defaultCharSetAndCollation[0];
		let charSet: string | null = dbCharSet;
		let collation: string | null = dbCollation;
		if (defDbCharSet === dbCharSet && defDbCollation === dbCollation) {
			charSet = null;
			collation = null;
		}

		res.columns.push({
			entityType: 'columns',
			table: table,
			name: name,
			type: changedType,
			notNull: !isNullable,
			autoIncrement: isAutoincrement,
			collation: collation,
			charSet: charSet,
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
			// If to create "unique + not null" column, mysql shows it as "PRI"
			// need to check by constraints only
			isPK: false,
			uniqueName: null,
		});
	}
	progressCallback('columns', res.columns.length, 'done');

	// PRIMARY KEYS

	// progressCallback('pks', 0, 'fetching');
	const pks = await db.query(`
		SELECT 
			CONSTRAINT_NAME, table_name, column_name, ordinal_position
		FROM information_schema.table_constraints t
		LEFT JOIN information_schema.key_column_usage k USING(constraint_name,table_schema,table_name)
		WHERE t.constraint_type='PRIMARY KEY'
			AND t.table_schema = '${schema}'
		ORDER BY ordinal_position
	`).then((rows) => {
		queryCallback('pks', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('pks', [], err);
		throw err;
	});

	const tableToPKs = pks.filter((it) => tableNames.has(it['TABLE_NAME'])).reduce<Record<string, PrimaryKey>>(
		(acc, it) => {
			const table: string = it['TABLE_NAME'];
			const column: string = it['COLUMN_NAME'];
			// const position: string = it['ordinal_position'];

			if (table in acc) {
				acc[table].columns.push(column);
			} else {
				acc[table] = {
					entityType: 'pks',
					table,
					name: it['CONSTRAINT_NAME'],
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
	// progressCallback('pks', res.pks.length, 'done');

	// FOREIGN KEYS

	progressCallback('fks', 0, 'fetching');
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
		LEFT JOIN information_schema.referential_constraints rc ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
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

	const filteredFKs = fks.filter((it) => tableNames.has(it['TABLE_NAME']));
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
					onDelete: deleteRule?.toUpperCase() as ForeignKey['onUpdate'] ?? 'NO ACTION',
					onUpdate: updateRule?.toUpperCase() as ForeignKey['onUpdate'] ?? 'NO ACTION',
					nameExplicit: true,
				} satisfies ForeignKey;
			}
			return acc;
		},
		{} as Record<string, ForeignKey>,
	);

	for (const fk of Object.values(groupedFKs)) {
		res.fks.push(fk);
	}
	progressCallback('fks', res.fks.length, 'done');

	// CHECKS

	progressCallback('checks', 0, 'fetching');
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

	for (const check of checks.filter((it) => tableNames.has(it['TABLE_NAME']))) {
		const table = check['TABLE_NAME'];
		const name = check['CONSTRAINT_NAME'];
		const value = check['CHECK_CLAUSE'];

		res.checks.push({
			entityType: 'checks',
			table,
			name,
			value,
		});
	}
	progressCallback('checks', res.checks.length, 'done');

	// VIEWS

	progressCallback('views', 0, 'fetching');
	const views = await batchQuery<{
		TABLE_NAME: string;
		VIEW_DEFINITION: string;
		CHECK_OPTION: string | null;
		SECURITY_TYPE: string;
	}>(
		db,
		({ limit, cursor }) =>
			`SELECT
				*
			FROM INFORMATION_SCHEMA.VIEWS
			WHERE table_schema = '${schema}'
				${cursor ? `AND TABLE_NAME > '${cursor.TABLE_NAME}'` : ''}
			ORDER BY TABLE_NAME
			LIMIT ${limit}`,
		(count) => {
			progressCallback('views', count, 'fetching');
		},
	).then((rows) => {
		queryCallback('views', rows, null);
		return rows.filter((it) => {
			return filter({ type: 'table', schema: false, name: it['TABLE_NAME'] });
		});
	}).catch((err) => {
		queryCallback('views', [], err);
		throw err;
	});

	for await (const view of views) {
		const name = view['TABLE_NAME'];
		const definition = view['VIEW_DEFINITION'];

		const checkOption = view['CHECK_OPTION'] as string | null;

		const withCheckOption = !checkOption || checkOption === 'NONE'
			? null
			: checkOption.toLowerCase();

		const sqlSecurity = view['SECURITY_TYPE'].toLowerCase() as 'definer' | 'invoker';

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
	progressCallback('views', res.views.length, 'done');

	return res;
};
