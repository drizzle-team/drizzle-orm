import type { BuildColumns, ColumnBuilderBase } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { SQL } from '~/sql/sql.ts';
import { getTableColumns } from '~/utils.ts';
import type { UpdateViewConfig, ViewConfig } from '~/view.ts';
import type { SingleStoreColumn } from './columns/index.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import { singlestoreTable } from './table.ts';
import { SingleStoreViewBase } from './view-base.ts';
import { SingleStoreViewConfig } from './view-common.ts';

export interface ViewBuilderConfig {
	algorithm?: 'undefined' | 'merge' | 'temptable';
	definer?: string;
	sqlSecurity?: 'definer' | 'invoker';
	withCheckOption?: 'cascaded' | 'local';
}

export class ViewBuilderCore<
	TConfig extends { name: string; columns?: unknown },
	TSchema extends string | undefined = undefined,
> {
	static readonly [entityKind]: string = 'SingleStoreViewBuilder';

	declare readonly _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

	constructor(
		protected name: TConfig['name'],
		protected schema: TSchema,
	) {}

	protected config: ViewBuilderConfig = {};

	algorithm(
		algorithm: Exclude<ViewBuilderConfig['algorithm'], undefined>,
	): this {
		this.config.algorithm = algorithm;
		return this;
	}

	definer(
		definer: Exclude<ViewBuilderConfig['definer'], undefined>,
	): this {
		this.config.definer = definer;
		return this;
	}

	sqlSecurity(
		sqlSecurity: Exclude<ViewBuilderConfig['sqlSecurity'], undefined>,
	): this {
		this.config.sqlSecurity = sqlSecurity;
		return this;
	}

	withCheckOption(
		withCheckOption?: Exclude<ViewBuilderConfig['withCheckOption'], undefined>,
	): this {
		this.config.withCheckOption = withCheckOption ?? 'cascaded';
		return this;
	}
}

export class ViewBuilder<
	TName extends string = string,
	TSchema extends string | undefined = undefined,
> extends ViewBuilderCore<{ name: TName }, TSchema> {
	static override readonly [entityKind]: string = 'SingleStoreViewBuilder';

	as<TSelectedFields extends SelectedFields>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): SingleStoreViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: false;
			isAlias: false;
			selectedFields: AddAliasToSelection<TSelectedFields, TName, 'singlestore'>;
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
			new SingleStoreView({
				singlestoreConfig: this.config,
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: aliasedSelection,
					query: qb.withoutSelectionCastCodecs().getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as SingleStoreViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: false;
				isAlias: false;
				selectedFields: AddAliasToSelection<TSelectedFields, TName, 'singlestore'>;
			}
		>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, ColumnBuilderBase> = Record<string, ColumnBuilderBase>,
	TSchema extends string | undefined = undefined,
> extends ViewBuilderCore<{ name: TName; columns: TColumns }, TSchema> {
	static override readonly [entityKind]: string = 'SingleStoreManualViewBuilder';

	private columns: Record<string, SingleStoreColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: TSchema,
	) {
		super(name, schema);
		this.columns = getTableColumns(singlestoreTable(name, columns)) as BuildColumns<TName, TColumns, 'singlestore'>;
	}

	existing(): SingleStoreViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: true;
			isAlias: false;
			selectedFields: BuildColumns<TName, TColumns, 'singlestore'>;
		}
	> {
		return new Proxy(
			new SingleStoreView({
				singlestoreConfig: undefined,
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
		) as SingleStoreViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: true;
				isAlias: false;
				selectedFields: BuildColumns<TName, TColumns, 'singlestore'>;
			}
		>;
	}

	as(
		query: SQL,
	): SingleStoreViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: false;
			isAlias: false;
			selectedFields: BuildColumns<TName, TColumns, 'singlestore'>;
		}
	> {
		return new Proxy(
			new SingleStoreView({
				singlestoreConfig: this.config,
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
		) as SingleStoreViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: false;
				isAlias: false;
				selectedFields: BuildColumns<TName, TColumns, 'singlestore'>;
			}
		>;
	}
}

export class SingleStoreView<T extends ViewConfig = ViewConfig> extends SingleStoreViewBase<T> {
	static override readonly [entityKind]: string = 'SingleStoreView';

	/** @internal */
	declare protected $SingleStoreViewBrand: 'SingleStoreView';

	/** @internal */
	[SingleStoreViewConfig]: ViewBuilderConfig | undefined;

	constructor({ singlestoreConfig, config }: {
		singlestoreConfig: ViewBuilderConfig | undefined;
		config: {
			name: T['name'];
			schema: T['schema'];
			selectedFields: SelectedFields;
			query: SQL | undefined;
		};
	}) {
		super(config);
		this[SingleStoreViewConfig] = singlestoreConfig;
	}
}

export type SingleStoreViewWithSelection<T extends ViewConfig> = SingleStoreView<T> & T['selectedFields'];

/**
 * Any SingleStore view with a specified boundary, e.g. `AnySingleStoreView<{ name: 'my_view' }>`.
 *
 * To describe any view with any config, use `SingleStoreView` without type arguments.
 */
export type AnySingleStoreView<TPartial extends Partial<ViewConfig> = {}> = SingleStoreView<
	UpdateViewConfig<ViewConfig, TPartial>
>;

// TODO: needs to be implemented differently compared to MySQL.
// /** @internal */
// export function singlestoreViewWithSchema(
// 	name: string,
// 	selection: Record<string, SingleStoreColumnBuilderBase> | undefined,
// 	schema: string | undefined,
// ): ViewBuilder | ManualViewBuilder {
// 	if (selection) {
// 		return new ManualViewBuilder(name, selection, schema);
// 	}
// 	return new ViewBuilder(name, schema);
// }

// export function singlestoreView<TName extends string>(name: TName): ViewBuilder<TName>;
// export function singlestoreView<TName extends string, TColumns extends Record<string, SingleStoreColumnBuilderBase>>(
// 	name: TName,
// 	columns: TColumns,
// ): ManualViewBuilder<TName, TColumns>;
// export function singlestoreView(
// 	name: string,
// 	selection?: Record<string, SingleStoreColumnBuilderBase>,
// ): ViewBuilder | ManualViewBuilder {
// 	return singlestoreViewWithSchema(name, selection, undefined);
// }
