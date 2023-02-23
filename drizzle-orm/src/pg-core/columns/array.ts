import { ColumnBaseConfig, ColumnConfig } from '~/column';
import { UpdateCBConfig } from '~/column-builder';
import { AnyPgTable } from '~/pg-core/table';
import { SQL, SQLWrapper } from '~/sql';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgArrayBuilderConfig {
	notNull: boolean;
	hasDefault: boolean;
	data: unknown[];
	driverParam: unknown[];
}

export interface PgArrayConfig extends PgArrayBuilderConfig {
	tableName: string;
}

export class PgArrayBuilder<T extends PgArrayBuilderConfig> extends PgColumnBuilder<
	{ notNull: T['notNull']; hasDefault: T['hasDefault']; data: T['data']; driverParam: T['driverParam'] },
	{
		baseBuilder: PgColumnBuilder<
			{
				notNull: T['notNull'];
				hasDefault: T['hasDefault'];
				data: T['data'][number];
				driverParam: T['driverParam'][number];
			}
		>;
		size: number | undefined;
	}
> {
	protected override $pgColumnBuilderBrand!: 'PgArrayBuilder';

	constructor(
		name: string,
		baseBuilder: PgArrayBuilder<T>['config']['baseBuilder'],
		size: number | undefined,
	) {
		super(name);
		this.config.baseBuilder = baseBuilder;
		this.config.size = size;
	}

	override notNull(): PgArrayBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.notNull() as any;
	}

	override default(value: T['data'] | SQL): PgArrayBuilder<UpdateCBConfig<T, { hasDefault: true }>> {
		return super.default(value) as any;
	}

	override primaryKey(): PgArrayBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.primaryKey() as any;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgArray<Pick<T, keyof PgArrayBuilderConfig> & { tableName: TTableName }> {
		const baseColumn = this.config.baseBuilder.build(table);
		return new PgArray<Pick<T, keyof PgArrayBuilderConfig> & { tableName: TTableName }>(table, this.config, baseColumn);
	}
}

export class PgArray<T extends PgArrayConfig> extends PgColumn<
	{
		tableName: T['tableName'];
		data: T['data'];
		driverParam: T['driverParam'];
		notNull: T['notNull'];
		hasDefault: T['hasDefault'];
	}
> {
	protected override $pgColumnBrand!: 'PgArray';

	readonly size: number | undefined;

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		private config: PgArrayBuilder<Omit<T, 'tableName'>>['config'],
		readonly baseColumn: PgColumn<{
			tableName: T['tableName'];
			notNull: T['notNull'];
			hasDefault: T['hasDefault'];
			data: T['data'][number];
			driverParam: T['driverParam'][number];
		}>,
		readonly range?: [number | undefined, number | undefined],
	) {
		super(table, config);
		this.size = config.size;
	}

	at(index: number): PgArrayAt<{
		tableName: T['tableName'];
		notNull: T['notNull'];
		hasDefault: T['hasDefault'];
		data: T['data'][number];
		driverParam: T['driverParam'][number];
	}> {
		return new PgArrayAt(this.table, this.config, index);
	}

	slice(range: `${number | ''}:${number | ''}`): PgArray<T> {
		const [start, end] = range.split(':').map((v) => (v === '' ? undefined : Number(v)));
		return new PgArray<T>(this.table, this.config, this.baseColumn, [start, end]);
	}

	getSQLType(): string {
		return `${this.baseColumn.getSQLType()}[${typeof this.size === 'number' ? this.size : ''}]`;
	}

	override mapFromDriverValue(value: T['driverParam']): T['data'] {
		return value.map((v) => this.baseColumn.mapFromDriverValue(v));
	}

	override mapToDriverValue(value: T['data']): T['driverParam'] {
		return value.map((v) => this.baseColumn.mapToDriverValue(v));
	}
}

export class PgArrayAt<T extends ColumnBaseConfig> extends PgColumn<T> {
	protected $pgColumnBrand = 'PgArrayAt';

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgArrayBuilder<{
			notNull: T['notNull'];
			hasDefault: T['hasDefault'];
			data: T['data'][];
			driverParam: T['driverParam'][];
		}>['config'],
		readonly index: number,
	) {
		super(table, config);
	}

	getSQLType(): string {
		throw new Error('This column is not a real column, it is only used for building SQL');
	}
}
