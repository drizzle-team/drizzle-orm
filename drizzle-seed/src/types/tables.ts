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
	generatedIdentityType?: 'always' | 'byDefault' | undefined;
	baseColumn?: {
		name: string;
		dataType: string;
		columnType: string;
		size?: number;
		default?: any;
		hasDefault: boolean;
		isUnique: boolean;
		notNull: boolean;
		baseColumn?: Column['baseColumn'];
	};
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

export type Prettify<T> =
	& {
		[K in keyof T]: T[K];
	}
	& {};
