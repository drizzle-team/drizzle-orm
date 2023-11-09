import type { AnyColumn } from './column.ts';
import { entityKind } from './entity.ts';
import type { BuiltInFunction } from './built-in-function.ts';
import type { SelectedFields } from './operations.ts';
import { SQL, type SQLWrapper } from './sql/index.ts';
import type { Table } from './table.ts';
import { ViewBaseConfig } from './view-common.ts';

export type ColumnsSelection = Record<string, unknown>;

export abstract class View<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelection extends ColumnsSelection = ColumnsSelection,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'View';

	declare _: {
		brand: 'View';
		viewBrand: string;
		name: TName;
		existing: TExisting;
		selectedFields: TSelection;
	};

	/** @internal */
	[ViewBaseConfig]: {
		name: TName;
		originalName: TName;
		schema: string | undefined;
		selectedFields: SelectedFields<AnyColumn, Table, BuiltInFunction>;
		isExisting: TExisting;
		query: TExisting extends true ? undefined : SQL;
		isAlias: boolean;
	};

	constructor(
		{ name, schema, selectedFields, query }: {
			name: TName;
			schema: string | undefined;
			selectedFields: SelectedFields<AnyColumn, Table, BuiltInFunction>;
			query: SQL | undefined;
		},
	) {
		this[ViewBaseConfig] = {
			name,
			originalName: name,
			schema,
			selectedFields,
			query: query as (TExisting extends true ? undefined : SQL),
			isExisting: !query as TExisting,
			isAlias: false,
		};
	}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}
