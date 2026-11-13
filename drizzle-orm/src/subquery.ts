import { entityKind, is } from './entity.ts';
import type { SQL, SQLChunk, SQLWrapper } from './sql/sql.ts';
import { IsAlias, OriginalName, Qualifier, TableColumns, TableName, TableSchema } from './table.utils.ts';

export interface Subquery<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TAlias extends string = string,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields extends Record<string, unknown> = Record<string, unknown>,
> extends SQLWrapper {
	// SQLWrapper runtime implementation is defined in 'sql/sql.ts'
}
export class Subquery<
	TAlias extends string = string,
	TSelectedFields extends Record<string, unknown> = Record<string, unknown>,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'Subquery';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	declare _: {
		brand: 'Subquery';
		sql: SQL;
		selectedFields: TSelectedFields;
		alias: TAlias;
		isWith: boolean;
	};

	/** @internal */
	declare readonly [Qualifier]: SQLChunk;

	/** @internal */
	public get [TableName](): string {
		return this._.alias;
	}

	/** @internal */
	public get [TableSchema](): string | undefined {
		return undefined;
	}

	/** @internal */
	public get [OriginalName](): string {
		return this._.alias;
	}

	/** @internal */
	public get [IsAlias](): boolean {
		return false;
	}

	/** @internal */
	public get [TableColumns](): Record<string, unknown> {
		return this._.selectedFields as Record<string, unknown>;
	}

	constructor(sql: SQL, fields: TSelectedFields, alias: string, isWith = false) {
		this._ = {
			brand: 'Subquery',
			sql,
			selectedFields: fields as TSelectedFields,
			alias: alias as TAlias,
			isWith,
		};
	}

	// getSQL(): SQL<unknown> {
	// 	return new SQL([this]);
	// }
}

export class WithSubquery<
	TAlias extends string = string,
	TSelection extends Record<string, unknown> = Record<string, unknown>,
> extends Subquery<TAlias, TSelection> {
	static override readonly [entityKind]: string = 'WithSubquery';
}

export type WithSubqueryWithoutSelection<TAlias extends string> = WithSubquery<TAlias, {}>;
