import { AbstractColumn, Column, IndexedColumn } from '../columns/column';
import ColumnType from '../columns/types/columnType';
import TableIndex from '../indexes/tableIndex';
import Type from '../types/type';

export type ExtractFieldNames<TTable> = {
  [Key in keyof TTable]: TTable[Key] extends Function ? never :
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    TTable[Key] extends Column<ColumnType, infer TNullable, infer TAutoIncrement> ?
      true extends TNullable ? never : Key
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      : TTable[Key] extends IndexedColumn<ColumnType, infer TNullable, infer TAutoIncrement> ?
        true extends TNullable ? never : Key:never
}[keyof TTable];

export type ExtractOptionalFieldNames<TTable> = {
  [Key in keyof TTable]: TTable[Key] extends Function ? never :
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    TTable[Key] extends Column<ColumnType, infer TNullable, infer TAutoIncrement> ?
      true extends TNullable ? Key : never
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      : TTable[Key] extends IndexedColumn<ColumnType, infer TNullable, infer TAutoIncrement> ?
        true extends TNullable ? Key : never : never
}[keyof TTable];

export type ExtractModel<TTable> =
  {[Key in ExtractFieldNames<TTable>]: ExtractCodeType<TTable[Key]>} &
  {[Key in ExtractOptionalFieldNames<TTable>]?: ExtractCodeType<TTable[Key]>};

export type ExtractCodeType<T extends AbstractColumn<ColumnType<any>, boolean, boolean>> =
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      T extends AbstractColumn<ColumnType<infer TCodeType>, infer TNullable, infer TAutoIncrement> ?
        TCodeType
        : never;

export type ExtractTypeEnum<T extends Type<any>> = T extends Type<infer TEnum>
  ? TEnum
  : never;

export type Indexing = IndexedColumn<ColumnType, boolean, boolean> | TableIndex;

export type AnyColumn = Column<ColumnType, boolean, boolean>
| IndexedColumn<ColumnType, boolean, boolean>;
