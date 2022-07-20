export const brand = Symbol('brand');
export const value = Symbol('value');

export type Brand<T, TName> = T & {
	[brand]: TName;
	[value]: T;
};

export type AnyBrand = Brand<any, any>;

export type Unwrap<T extends AnyBrand> = T extends { [value]: infer TValue } ? TValue : never;

export type TableName<T extends string = string> = Brand<T, 'TableName'>;
export type ColumnData<T = unknown> = Brand<T, 'ColumnData'>;
export type ColumnDriverParam<T = unknown> = Brand<T, 'ColumnDriverParam'>;
export type ColumnNotNull<T extends boolean = boolean> = Brand<T, 'ColumnNotNull'>;
export type ColumnHasDefault<T extends boolean = boolean> = Brand<T, 'ColumnHasDefault'>;
