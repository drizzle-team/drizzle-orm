import type { Casing } from '~/casing.ts';
import type { BuildColumns, ColumnBuilderBase } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { getTableColumns } from '~/utils.ts';
import type { UpdateViewConfig, ViewConfig } from '~/view.ts';
import type { MySqlColumn } from './columns/index.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import { mysqlTableWithSchema } from './table.ts';
import { MySqlViewBase } from './view-base.ts';
import { MySqlViewConfig } from './view-common.ts';

export interface ViewBuilderConfig {
	algorithm?: 'undefined' | 'merge' | 'temptable';
	sqlSecurity?: 'definer' | 'invoker';
	withCheckOption?: 'cascaded' | 'local';
}

export class ViewBuilderCore<
	TConfig extends { name: string; columns?: unknown },
	TSchema extends string | undefined = undefined,
> {
	static readonly [entityKind]: string = 'MySqlViewBuilder';

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
	static override readonly [entityKind]: string = 'MySqlViewBuilder';

	as<TSelectedFields extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): MySqlViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: false;
			isAlias: false;
			selectedFields: AddAliasToSelection<TSelectedFields, TName, 'mysql'>;
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
			new MySqlView({
				mysqlConfig: this.config,
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: aliasedSelection,
					query: qb.withoutSelectionCastCodecs().getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as MySqlViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: false;
				isAlias: false;
				selectedFields: AddAliasToSelection<TSelectedFields, TName, 'mysql'>;
			}
		>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, ColumnBuilderBase> = Record<string, ColumnBuilderBase>,
	TSchema extends string | undefined = undefined,
> extends ViewBuilderCore<{ name: TName; columns: TColumns }, TSchema> {
	static override readonly [entityKind]: string = 'MySqlManualViewBuilder';

	private columns: Record<string, MySqlColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: TSchema,
		casing: Casing | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(mysqlTableWithSchema(name, columns, undefined, schema, casing)) as BuildColumns<
			TName,
			TColumns,
			'mysql'
		>;
	}

	existing(): MySqlViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: true;
			isAlias: false;
			selectedFields: BuildColumns<TName, TColumns, 'mysql'>;
		}
	> {
		return new Proxy(
			new MySqlView({
				mysqlConfig: undefined,
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
		) as MySqlViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: true;
				isAlias: false;
				selectedFields: BuildColumns<TName, TColumns, 'mysql'>;
			}
		>;
	}

	as(
		query: SQL,
	): MySqlViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: false;
			isAlias: false;
			selectedFields: BuildColumns<TName, TColumns, 'mysql'>;
		}
	> {
		return new Proxy(
			new MySqlView({
				mysqlConfig: this.config,
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
		) as MySqlViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: false;
				isAlias: false;
				selectedFields: BuildColumns<TName, TColumns, 'mysql'>;
			}
		>;
	}
}

export class MySqlView<T extends ViewConfig = ViewConfig> extends MySqlViewBase<T> {
	static override readonly [entityKind]: string = 'MySqlView';

	/** @internal */
	declare protected $MySqlViewBrand: 'MySqlView';

	/** @internal */
	[MySqlViewConfig]: ViewBuilderConfig | undefined;

	constructor({ mysqlConfig, config }: {
		mysqlConfig: ViewBuilderConfig | undefined;
		config: {
			name: T['name'];
			schema: T['schema'];
			selectedFields: ColumnsSelection;
			query: SQL | undefined;
		};
	}) {
		super(config);
		this[MySqlViewConfig] = mysqlConfig;
	}
}

export type MySqlViewWithSelection<T extends ViewConfig> = MySqlView<T> & T['selectedFields'];

/**
 * Any MySQL view with a specified boundary, e.g. `AnyMySqlView<{ name: 'my_view' }>`.
 *
 * To describe any view with any config, use `MySqlView` without type arguments.
 */
export type AnyMySqlView<TPartial extends Partial<ViewConfig> = {}> = MySqlView<UpdateViewConfig<ViewConfig, TPartial>>;

/** @internal */
export function mysqlViewWithSchema<TSchema extends string | undefined>(
	name: string,
	selection: Record<string, ColumnBuilderBase> | undefined,
	schema: TSchema,
	casing: Casing | undefined,
): ViewBuilder<string, TSchema> | ManualViewBuilder<string, Record<string, ColumnBuilderBase>, TSchema> {
	if (selection) {
		return new ManualViewBuilder(name, selection, schema, casing);
	}
	return new ViewBuilder(name, schema);
}

export interface MySqlViewFn<TSchema extends string | undefined = undefined> {
	<TName extends string>(name: TName): ViewBuilder<TName, TSchema>;
	<TName extends string, TColumns extends Record<string, ColumnBuilderBase>>(
		name: TName,
		columns: TColumns,
	): ManualViewBuilder<TName, TColumns, TSchema>;
}

/** @internal */
export function mysqlViewWithCasing(casing: Casing | undefined): MySqlViewFn {
	return ((name, columns) => mysqlViewWithSchema(name, columns, undefined, casing)) as MySqlViewFn;
}

export const mysqlView = mysqlViewWithCasing(undefined);
