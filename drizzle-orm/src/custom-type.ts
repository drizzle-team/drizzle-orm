import { SQL, sql } from './sql';

export type DriverValueMapper<TData, TDriverData> = {
  toDriver(value: TData): TDriverData;
  fromDriver(value: TDriverData): TData;
};

export interface CustomTypeConfig<TData, TDriverData> {
  dataType(): string;
  toDriver(value: TData): TDriverData;
  fromDriver(value: TDriverData): TData;
  selectFromDb?(column: string, decoder: DriverValueMapper<TData, TDriverData>): SQL;
}

export function customType<TData, TDriverData>({
  dataType,
  toDriver,
  fromDriver,
  selectFromDb,
}: CustomTypeConfig<TData, TDriverData>) {
  return {
    dataType,
    toDriver,
    fromDriver,
    selectFromDb,
    mapWith: (value: any) => {
      return fromDriver(value);
    },
  };
}
