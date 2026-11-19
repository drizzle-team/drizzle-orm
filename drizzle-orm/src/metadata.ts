import type { ColumnDataType, GeneratedType } from './column-builder.ts';
import type { Column } from './column.ts';
import { getTableName, Schema, Table } from './table.ts';
import { getTableColumns } from './utils.ts';

// Duplicated rather than imported from `mysql-core` / `singlestore-core` to keep
// this module dialect-agnostic — `drizzle-orm/src` must not depend on dialect packages.
type TextTypeLiteral = 'tinytext' | 'text' | 'mediumtext' | 'longtext';

export interface ColumnMetadata {
	name: string;
	dataType: ColumnDataType;
	columnType: string;
	sqlType: string;
	notNull: boolean;
	hasDefault: boolean;
	primary: boolean;
	isUnique: boolean;
	generated: GeneratedType | null;
	generatedIdentity: GeneratedType | null;
	enumValues: readonly string[] | null;
	// Dialect-specific extras: omitted when not applicable to the column type, to
	// keep build-time-emitted metadata files (see drizzle-team/drizzle-orm#941) compact.
	length?: number;
	dimensions?: number;
	size?: number;
	textType?: TextTypeLiteral;
	baseColumn?: ColumnMetadata;
}

export interface TableMetadata {
	name: string;
	schema: string | null;
	baseName: string;
	columns: Record<string, ColumnMetadata>;
}

type ColumnWithDialectExtras = Column & {
	length?: number;
	dimensions?: number;
	size?: number;
	textType?: TextTypeLiteral;
	baseColumn?: Column;
};

function buildColumnMetadata(column: Column): ColumnMetadata {
	const c = column as ColumnWithDialectExtras;

	const meta: ColumnMetadata = {
		name: c.name,
		dataType: c.dataType,
		columnType: c.columnType,
		sqlType: c.getSQLType(),
		notNull: c.notNull,
		hasDefault: c.hasDefault,
		primary: c.primary,
		isUnique: c.isUnique,
		// Drizzle treats a generated column with an undefined `type` as 'always'
		// (see Column.shouldDisableInsert in column.ts); mirror that here.
		generated: c.generated ? c.generated.type ?? 'always' : null,
		generatedIdentity: c.generatedIdentity?.type ?? null,
		enumValues: c.enumValues ?? null,
	};

	if (c.length !== undefined) meta.length = c.length;
	if (c.dimensions !== undefined) meta.dimensions = c.dimensions;
	if (c.size !== undefined) meta.size = c.size;
	if (c.textType !== undefined) meta.textType = c.textType;
	if (c.baseColumn !== undefined) meta.baseColumn = buildColumnMetadata(c.baseColumn);

	return meta;
}

export function getTableMetadata(table: Table): TableMetadata {
	const columnsMap = getTableColumns(table);
	const columns: Record<string, ColumnMetadata> = {};

	for (const [key, col] of Object.entries(columnsMap)) {
		columns[key] = buildColumnMetadata(col as Column);
	}

	return {
		name: getTableName(table),
		schema: table[Schema] ?? null,
		baseName: table[Table.Symbol.BaseName],
		columns,
	};
}
