import type { Casing } from '~/casing.ts';
import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { getTableColumns } from '~/utils.ts';
import type { UpdateViewConfig, ViewConfig } from '~/view.ts';
import type { AnyCockroachColumnBuilder, CockroachBuildColumns, CockroachColumn } from './columns/common.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import { cockroachTableWithSchema } from './table.ts';
import { CockroachViewBase } from './view-base.ts';

export class DefaultViewBuilderCore<
	TConfig extends { name: string; columns?: unknown },
	TSchema extends string | undefined = undefined,
> {
	static readonly [entityKind]: string = 'CockroachDefaultViewBuilderCore';

	declare readonly _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

	constructor(
		protected name: TConfig['name'],
		protected schema: TSchema,
	) {}
}

export class ViewBuilder<
	TName extends string = string,
	TSchema extends string | undefined = undefined,
> extends DefaultViewBuilderCore<{ name: TName }, TSchema> {
	static override readonly [entityKind]: string = 'CockroachViewBuilder';

	as<TSelectedFields extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): CockroachViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: false;
			isAlias: false;
			selectedFields: AddAliasToSelection<TSelectedFields, TName, 'cockroach'>;
		}
	> {
		if (typeof qb === 'function') {
			qb = qb(new QueryBuilder());
		}
		const selectionProxy = new SelectionProxyHandler<TSelectedFields>({
			alias: this.name,
			sqlBehavior: 'error',
			sqlAliasedBehavior: 'alias',
			replaceOriginalName: true,
		});
		const aliasedSelection = new Proxy(qb.getSelectedFields(), selectionProxy);
		return new Proxy(
			new CockroachView({
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: aliasedSelection,
					query: qb.withoutSelectionCastCodecs().getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as CockroachViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: false;
				isAlias: false;
				selectedFields: AddAliasToSelection<TSelectedFields, TName, 'cockroach'>;
			}
		>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, AnyCockroachColumnBuilder> = Record<string, AnyCockroachColumnBuilder>,
	TSchema extends string | undefined = undefined,
> extends DefaultViewBuilderCore<{ name: TName; columns: TColumns }, TSchema> {
	static override readonly [entityKind]: string = 'CockroachManualViewBuilder';

	private columns: Record<string, CockroachColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: TSchema,
		casing: Casing | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(cockroachTableWithSchema(name, columns, undefined, schema, casing));
	}

	existing(): CockroachViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: true;
			isAlias: false;
			selectedFields: CockroachBuildColumns<TName, TColumns>;
		}
	> {
		return new Proxy(
			new CockroachView({
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: this.columns,
					query: undefined,
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
				replaceOriginalName: true,
			}),
		) as CockroachViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: true;
				isAlias: false;
				selectedFields: CockroachBuildColumns<TName, TColumns>;
			}
		>;
	}

	as(
		query: SQL,
	): CockroachViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: false;
			isAlias: false;
			selectedFields: CockroachBuildColumns<TName, TColumns>;
		}
	> {
		return new Proxy(
			new CockroachView({
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: this.columns,
					query: query.inlineParams(),
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
				replaceOriginalName: true,
			}),
		) as CockroachViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: false;
				isAlias: false;
				selectedFields: CockroachBuildColumns<TName, TColumns>;
			}
		>;
	}
}

export class MaterializedViewBuilderCore<
	TConfig extends { name: string; columns?: unknown },
	TSchema extends string | undefined = undefined,
> {
	static readonly [entityKind]: string = 'CockroachMaterializedViewBuilderCore';

	declare _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

	constructor(
		protected name: TConfig['name'],
		protected schema: TSchema,
	) {}

	protected config: {
		withNoData?: boolean;
	} = {};

	withNoData(): this {
		this.config.withNoData = true;
		return this;
	}
}

export class MaterializedViewBuilder<
	TName extends string = string,
	TSchema extends string | undefined = undefined,
> extends MaterializedViewBuilderCore<{ name: TName }, TSchema> {
	static override readonly [entityKind]: string = 'CockroachMaterializedViewBuilder';

	as<TSelectedFields extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): CockroachMaterializedViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: false;
			isAlias: false;
			selectedFields: AddAliasToSelection<TSelectedFields, TName, 'cockroach'>;
		}
	> {
		if (typeof qb === 'function') {
			qb = qb(new QueryBuilder());
		}
		const selectionProxy = new SelectionProxyHandler<TSelectedFields>({
			alias: this.name,
			sqlBehavior: 'error',
			sqlAliasedBehavior: 'alias',
			replaceOriginalName: true,
		});
		const aliasedSelection = new Proxy(qb.getSelectedFields(), selectionProxy);
		return new Proxy(
			new CockroachMaterializedView({
				cockroachConfig: {
					withNoData: this.config.withNoData,
				},
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: aliasedSelection,
					query: qb.withoutSelectionCastCodecs().getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as CockroachMaterializedViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: false;
				isAlias: false;
				selectedFields: AddAliasToSelection<TSelectedFields, TName, 'cockroach'>;
			}
		>;
	}
}

export class ManualMaterializedViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, AnyCockroachColumnBuilder> = Record<string, AnyCockroachColumnBuilder>,
	TSchema extends string | undefined = undefined,
> extends MaterializedViewBuilderCore<{ name: TName; columns: TColumns }, TSchema> {
	static override readonly [entityKind]: string = 'CockroachManualMaterializedViewBuilder';

	private columns: Record<string, CockroachColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: TSchema,
		casing: Casing | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(cockroachTableWithSchema(name, columns, undefined, schema, casing));
	}

	existing(): CockroachMaterializedViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: true;
			isAlias: false;
			selectedFields: CockroachBuildColumns<TName, TColumns>;
		}
	> {
		return new Proxy(
			new CockroachMaterializedView({
				cockroachConfig: {
					withNoData: this.config.withNoData,
				},
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: this.columns,
					query: undefined,
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
				replaceOriginalName: true,
			}),
		) as CockroachMaterializedViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: true;
				isAlias: false;
				selectedFields: CockroachBuildColumns<TName, TColumns>;
			}
		>;
	}

	as(
		query: SQL,
	): CockroachMaterializedViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: false;
			isAlias: false;
			selectedFields: CockroachBuildColumns<TName, TColumns>;
		}
	> {
		return new Proxy(
			new CockroachMaterializedView({
				cockroachConfig: {
					withNoData: this.config.withNoData,
				},
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: this.columns,
					query: query.inlineParams(),
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
				replaceOriginalName: true,
			}),
		) as CockroachMaterializedViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: false;
				isAlias: false;
				selectedFields: CockroachBuildColumns<TName, TColumns>;
			}
		>;
	}
}

export class CockroachView<T extends ViewConfig = ViewConfig> extends CockroachViewBase<T> {
	static override readonly [entityKind]: string = 'CockroachView';

	constructor({ config }: {
		config: {
			name: T['name'];
			schema: T['schema'];
			selectedFields: ColumnsSelection;
			query: SQL | undefined;
		};
	}) {
		super(config);
	}
}

export type CockroachViewWithSelection<T extends ViewConfig> = CockroachView<T> & T['selectedFields'];

/**
 * Any CockroachDB view with a specified boundary, e.g. `AnyCockroachView<{ name: 'my_view' }>`.
 *
 * To describe any view with any config, use `CockroachView` without type arguments.
 */
export type AnyCockroachView<TPartial extends Partial<ViewConfig> = {}> = CockroachView<
	UpdateViewConfig<ViewConfig, TPartial>
>;

export const CockroachMaterializedViewConfig = Symbol.for('drizzle:CockroachMaterializedViewConfig');

export class CockroachMaterializedView<T extends ViewConfig = ViewConfig> extends CockroachViewBase<T> {
	static override readonly [entityKind]: string = 'CockroachMaterializedView';

	readonly [CockroachMaterializedViewConfig]: {
		readonly withNoData?: boolean;
	} | undefined;

	constructor({ cockroachConfig, config }: {
		cockroachConfig: {
			withNoData: boolean | undefined;
		} | undefined;
		config: {
			name: T['name'];
			schema: T['schema'];
			selectedFields: ColumnsSelection;
			query: SQL | undefined;
		};
	}) {
		super(config);
		this[CockroachMaterializedViewConfig] = {
			withNoData: cockroachConfig?.withNoData,
		};
	}
}

export type CockroachMaterializedViewWithSelection<T extends ViewConfig> =
	& CockroachMaterializedView<T>
	& T['selectedFields'];

/**
 * Any CockroachDB materialized view with a specified boundary, e.g. `AnyCockroachMaterializedView<{ name: 'my_view' }>`.
 *
 * To describe any view with any config, use `CockroachMaterializedView` without type arguments.
 */
export type AnyCockroachMaterializedView<TPartial extends Partial<ViewConfig> = {}> = CockroachMaterializedView<
	UpdateViewConfig<ViewConfig, TPartial>
>;

/** @internal */
export function cockroachViewWithSchema<TSchema extends string | undefined>(
	name: string,
	selection: Record<string, AnyCockroachColumnBuilder> | undefined,
	schema: TSchema,
	casing: Casing | undefined,
): ViewBuilder<string, TSchema> | ManualViewBuilder<string, Record<string, AnyCockroachColumnBuilder>, TSchema> {
	if (selection) {
		return new ManualViewBuilder(name, selection, schema, casing);
	}
	return new ViewBuilder(name, schema);
}

/** @internal */
export function cockroachMaterializedViewWithSchema<TSchema extends string | undefined>(
	name: string,
	selection: Record<string, AnyCockroachColumnBuilder> | undefined,
	schema: TSchema,
	casing: Casing | undefined,
):
	| MaterializedViewBuilder<string, TSchema>
	| ManualMaterializedViewBuilder<string, Record<string, AnyCockroachColumnBuilder>, TSchema>
{
	if (selection) {
		return new ManualMaterializedViewBuilder(name, selection, schema, casing);
	}
	return new MaterializedViewBuilder(name, schema);
}

export interface CockroachViewFn<TSchema extends string | undefined = undefined> {
	<TName extends string>(name: TName): ViewBuilder<TName, TSchema>;
	<TName extends string, TColumns extends Record<string, AnyCockroachColumnBuilder>>(
		name: TName,
		columns: TColumns,
	): ManualViewBuilder<TName, TColumns, TSchema>;
}

export interface CockroachMaterializedViewFn<TSchema extends string | undefined = undefined> {
	<TName extends string>(name: TName): MaterializedViewBuilder<TName, TSchema>;
	<TName extends string, TColumns extends Record<string, AnyCockroachColumnBuilder>>(
		name: TName,
		columns: TColumns,
	): ManualMaterializedViewBuilder<TName, TColumns, TSchema>;
}

export function cockroachViewWithCasing(casing: Casing | undefined): CockroachViewFn {
	return ((name, columns) => cockroachViewWithSchema(name, columns, undefined, casing)) as CockroachViewFn;
}

/** @internal */
export function cockroachMaterializedViewWithCasing(casing: Casing | undefined): CockroachMaterializedViewFn {
	return ((name, columns) =>
		cockroachMaterializedViewWithSchema(name, columns, undefined, casing)) as CockroachMaterializedViewFn;
}

export const cockroachView = cockroachViewWithCasing(undefined);

export const cockroachMaterializedView = cockroachMaterializedViewWithCasing(undefined);

export function isCockroachView(obj: unknown): obj is CockroachView {
	return is(obj, CockroachView);
}

export function isCockroachMaterializedView(obj: unknown): obj is CockroachMaterializedView {
	return is(obj, CockroachMaterializedView);
}
