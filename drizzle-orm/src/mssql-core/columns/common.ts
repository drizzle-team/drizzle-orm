import { ColumnBuilder } from '~/column-builder.ts';
import type {
	ColumnBuilderBase,
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	HasGenerated,
	MakeColumnConfig,
	NotNull,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { ForeignKey, UpdateDeleteAction } from '~/mssql-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/mssql-core/foreign-keys.ts';
import type { AnyMsSqlTable, MsSqlTable } from '~/mssql-core/table.ts';
import type { SQL } from '~/sql/index.ts';
import type { Update } from '~/utils.ts';

export interface ReferenceConfig {
	ref: () => MsSqlColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export interface MsSqlColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> extends ColumnBuilderBase<T, TTypeConfig & { dialect: 'mssql' }> {}

export interface MsSqlGeneratedColumnConfig {
	mode?: 'virtual' | 'stored';
}

export abstract class MsSqlColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string> & {
		data: any;
	},
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'mssql' }, TExtraConfig>
	implements MsSqlColumnBuilderBase<T, TTypeConfig>
{
	static override readonly [entityKind]: string = 'MsSqlColumnBuilder';

	private foreignKeyConfigs: ReferenceConfig[] = [];

	references(ref: ReferenceConfig['ref'], actions: ReferenceConfig['actions'] = {}): this {
		this.foreignKeyConfigs.push({ ref, actions });
		return this;
	}

	unique(name?: string): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		return this;
	}

	generatedAlwaysAs(
		as: SQL | T['data'] | (() => SQL),
		config?: MsSqlGeneratedColumnConfig,
	): HasGenerated<this, {
		type: 'always';
	}> {
		this.config.generated = {
			as,
			type: 'always',
			mode: config?.mode ?? 'virtual',
		};
		return this as any;
	}

	/** @internal */
	buildForeignKeys(column: MsSqlColumn, table: MsSqlTable): ForeignKey[] {
		return this.foreignKeyConfigs.map(({ ref, actions }) => {
			return ((ref, actions) => {
				const builder = new ForeignKeyBuilder(() => {
					const foreignColumn = ref();
					return { columns: [column], foreignColumns: [foreignColumn] };
				});
				if (actions.onUpdate) {
					builder.onUpdate(actions.onUpdate);
				}
				if (actions.onDelete) {
					builder.onDelete(actions.onDelete);
				}
				return builder.build(table);
			})(ref, actions);
		});
	}

	/** @internal */
	abstract build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlColumn<MakeColumnConfig<T, TTableName>>;
}

// To understand how to use `MsSqlColumn` and `AnyMsSqlColumn`, see `Column` and `AnyColumn` documentation.
export abstract class MsSqlColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig, TTypeConfig & { dialect: 'mssql' }> {
	static override readonly [entityKind]: string = 'MsSqlColumn';

	constructor(
		override readonly table: MsSqlTable,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		super(table, config);
	}

	/** @internal */
	override shouldDisableInsert(): boolean {
		return false;
	}
}

export type AnyMsSqlColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> = MsSqlColumn<
	Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
>;

export interface MsSqlColumnWithIdentityConfig {
	identity?: { seed: number; increment: number } | true | undefined;
}

export abstract class MsSqlColumnBuilderWithIdentity<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<
		ColumnDataType,
		string
	>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends MsSqlColumnBuilder<T, TRuntimeConfig & MsSqlColumnWithIdentityConfig, TExtraConfig> {
	static override readonly [entityKind]: string = 'MsSqlColumnBuilderWithAutoIncrement';

	constructor(name: NonNullable<T['name']>, dataType: T['dataType'], columnType: T['columnType']) {
		super(name, dataType, columnType);
	}

	identity(): NotNull<HasGenerated<this>>;
	identity(seed: number, increment: number): NotNull<HasGenerated<this>>;
	identity(seed?: number, increment?: number): NotNull<HasGenerated<this>> {
		this.config.identity = seed !== undefined && increment !== undefined ? { seed, increment } : true;
		this.config.hasDefault = true;
		this.config.notNull = true;
		return this as NotNull<HasGenerated<this>>;
	}
}

export abstract class MsSqlColumnWithIdentity<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<
		ColumnDataType,
		string
	>,
	TRuntimeConfig extends object = object,
> extends MsSqlColumn<T, MsSqlColumnWithIdentityConfig & TRuntimeConfig> {
	static override readonly [entityKind]: string = 'MsSqlColumnWithAutoIncrement';

	readonly identity = this.config.identity;
	private getIdentity() {
		if (this.identity) {
			return typeof this.identity === 'object'
				? `identity(${this.identity.seed}, ${this.identity.increment})`
				: 'identity';
		}
		return;
	}

	abstract _getSQLType(): string;

	override getSQLType(): string {
		const identity = this.getIdentity();
		return identity ? `${this._getSQLType()} ${identity}` : this._getSQLType();
	}

	override shouldDisableInsert(): boolean {
		return !!this.identity;
	}
}
