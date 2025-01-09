export type DbPrimaryKey = {
	name: string;
	columns: string[];
};

export type DbForeignKey = {
	name: string;
	tableFrom: string;
	columnsFrom: string[];
	schemaFrom: string;
	schemaTo: string;
	tableTo: string;
	columnsTo: string[];
	onUpdate?: string;
	onDelete?: string;
};

export type DbColumn = {
	name: string;
	type: string;
	primaryKey: boolean;
	notNull: boolean;
	default?: any;
	isUnique?: any;
	autoIncrement?: boolean;
	uniqueName?: string;
	nullsNotDistinct?: boolean;
	onUpdate?: boolean;
};

export type DbTable = {
	name: string;
	type: 'table';
	database?: string;
	schema: string;
	columns: Record<string, DbColumn>;
	indexes: Record<string, any>;
	foreignKeys: Record<string, DbForeignKey>;
	compositePrimaryKeys: Record<string, DbPrimaryKey>;
	uniqueConstraints: Record<string, any>;
};

export type DbView = Omit<DbTable, 'type'> & {
	type: 'view' | 'mat_view';
};

export type DbSchema = {
	database?: string;
	tables: Record<string, DbTable>;
	views: Record<string, DbView>;
	enums: Record<string, [string, ...string[]]>;
};

export type DrizzleStudioObjectType = { [schemaName: string]: DbSchema };

export type DrizzleStudioRelationType = {
	name: string;
	type: 'one' | 'many';
	table: string;
	schema: string;
	columns: string[];
	refTable: string;
	refSchema: string;
	refColumns: string[];
};
