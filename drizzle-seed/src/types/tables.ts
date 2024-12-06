/* eslint-disable @typescript-eslint/no-explicit-any */

export type Column = {
	name: string;
	dataType: string;
	columnType: string;
	size?: number;
	default?: any;
	hasDefault: boolean;
	enumValues?: string[];
	isUnique: boolean;
	notNull: boolean;
	primary: boolean;
	generatedIdentityType?: 'always' | 'byDefault' | undefined;
	baseColumn?: Omit<Column, 'generatedIdentityType'>;
};

export type Table = {
	name: string;
	columns: Column[];
	primaryKeys: string[];
};

export type Relation = {
	// name: string;
	// type: "one" | "many";
	table: string;
	// schema: string;
	columns: string[];
	refTable: string;
	// refSchema: string;
	refColumns: string[];
};

export type RelationWithReferences = Relation & { isCyclic?: boolean; refTableRels: RelationWithReferences[] };

export type Prettify<T> =
	& {
		[K in keyof T]: T[K];
	}
	& {};
