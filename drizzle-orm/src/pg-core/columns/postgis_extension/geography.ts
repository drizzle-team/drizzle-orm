import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';

import type { Equal } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';
import { parseEWKB } from './utils.ts';

export type PgGeographyBuilderInitial<TName extends string> = PgGeographyBuilder<{
    name: TName;
    dataType: 'array';
    columnType: 'PgGeography';
    data: [number, number];
    driverParam: string;
    enumValues: undefined;
    generated: undefined;
}>;

export class PgGeographyBuilder<T extends ColumnBuilderBaseConfig<'array', 'PgGeography'>> extends PgColumnBuilder<T> {
    static readonly [entityKind]: string = 'PgGeographyBuilder';

    constructor(name: T['name']) {
        super(name, 'array', 'PgGeography');
    }

    /** @internal */
    override build<TTableName extends string>(
        table: AnyPgTable<{ name: TTableName }>,
    ): PgGeography<MakeColumnConfig<T, TTableName>> {
        return new PgGeography<MakeColumnConfig<T, TTableName>>(
            table,
            this.config as ColumnBuilderRuntimeConfig<any, any>,
        );
    }
}

export class PgGeography<T extends ColumnBaseConfig<'array', 'PgGeography'>> extends PgColumn<T> {
    static readonly [entityKind]: string = 'PgGeography';

    getSQLType(): string {
        return 'geography(point)';
    }

    override mapFromDriverValue(value: string): [number, number] {
        return parseEWKB(value);
    }

    override mapToDriverValue(value: [number, number]): string {
        return `point(${value[0]} ${value[1]})`;
    }
}

export type PgGeographyObjectBuilderInitial<TName extends string> = PgGeographyObjectBuilder<{
    name: TName;
    dataType: 'json';
    columnType: 'PgGeographyObject';
    data: { lon: number; lat: number };
    driverParam: string;
    enumValues: undefined;
    generated: undefined;
}>;

export class PgGeographyObjectBuilder<T extends ColumnBuilderBaseConfig<'json', 'PgGeographyObject'>>
    extends PgColumnBuilder<T>
{
    static readonly [entityKind]: string = 'PgGeographyObjectBuilder';

    constructor(name: T['name']) {
        super(name, 'json', 'PgGeographyObject');
    }

    /** @internal */
    override build<TTableName extends string>(
        table: AnyPgTable<{ name: TTableName }>,
    ): PgGeographyObject<MakeColumnConfig<T, TTableName>> {
        return new PgGeographyObject<MakeColumnConfig<T, TTableName>>(
            table,
            this.config as ColumnBuilderRuntimeConfig<any, any>,
        );
    }
}

export class PgGeographyObject<T extends ColumnBaseConfig<'json', 'PgGeographyObject'>> extends PgColumn<T> {
    static readonly [entityKind]: string = 'PgGeographyObject';

    getSQLType(): string {
        return 'geography(point)';
    }

    override mapFromDriverValue(value: string): { lon: number; lat: number } {
        const parsed = parseEWKB(value);
        return { lon: parsed[0], lat: parsed[1] };
    }

    override mapToDriverValue(value: { lon: number; lat: number }): string {
        return `point(${value.lon} ${value.lat})`;
    }
}

interface PgGeographyConfig<T extends 'tuple' | 'json' = 'tuple' | 'json'> {
    mode?: T;
    type?: 'point' | (string & {});
}

export function geography<TName extends string, TMode extends PgGeographyConfig['mode'] & {}>(
    name: TName,
    config?: PgGeographyConfig<TMode>,
): Equal<TMode, 'json'> extends true ? PgGeographyObjectBuilderInitial<TName>
    : PgGeographyBuilderInitial<TName>;
export function geography(name: string, config?: PgGeographyConfig) {
    if (!config?.mode || config.mode === 'tuple') {
        return new PgGeographyBuilder(name);
    }
    return new PgGeographyObjectBuilder(name);
}
