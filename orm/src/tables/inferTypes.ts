/* eslint-disable max-len */
import { UpdateCustomExpr } from '../builders/requestBuilders/updates/updates';
import { AbstractColumn, Column, IndexedColumn } from '../columns/column';
import ColumnType from '../columns/types/columnType';
import TableIndex from '../indexes/tableIndex';
import Type from '../types/type';
import AbstractTable from './abstractTable';

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

export type ExtractPartialObjectFromColumns<TTable> =
  {[Key in ExtractFieldNames<TTable>]: TTable[Key]} &
  {[Key in ExtractOptionalFieldNames<TTable>]?: TTable[Key] };

export type ExtractModel<TTable> =
  {[Key in ExtractFieldNames<TTable>]: ExtractCodeType<TTable[Key]>} &
  {[Key in ExtractOptionalFieldNames<TTable>]?: ExtractCodeType<TTable[Key]>};

export type ExtractUpdateModel<TTable> =
  {[Key in ExtractFieldNames<TTable>]:
    ExtractCodeType<TTable[Key]> | UpdateCustomExpr<TTable[Key]>} &
  {[Key in ExtractOptionalFieldNames<TTable>]?:
    ExtractCodeType<TTable[Key]> | UpdateCustomExpr<TTable[Key]> };

export type ExtractCodeType<T extends AbstractColumn<ColumnType<any>, boolean, boolean>> =
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      T extends AbstractColumn<ColumnType<infer TCodeType>, infer TNullable, infer TAutoIncrement, any> ?
        TCodeType
        : never;

export type ExtractTypeEnum<T extends Type<any>> = T extends Type<infer TEnum>
  ? TEnum
  : never;

export type Indexing = IndexedColumn<ColumnType, boolean, boolean> | TableIndex;

export type AnyColumn = Column<ColumnType, boolean, boolean>
| IndexedColumn<ColumnType, boolean, boolean>;

export type PartialFor<TTable extends AbstractTable<TTable>>
= {[name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, TTable>};

export type FullOrPartial<TTable extends AbstractTable<TTable>, TPartial extends PartialFor<TTable>>
= [keyof TPartial] extends [never] ? ExtractModel<TTable>: ExtractModel<TPartial>;

export type CheckTwoTypes<TInput, TTable extends AbstractTable<TTable>, TTable1 extends AbstractTable<TTable1>> = TInput extends AbstractTable<TTable> ? TTable : TInput extends AbstractTable<TTable1> ? TTable1 : never;
export type CheckThreeTypes<TInput, TTable extends AbstractTable<TTable>, TTable1 extends AbstractTable<TTable1>, TTable2 extends AbstractTable<TTable2>> = TInput extends AbstractTable<TTable> ? TTable : TInput extends AbstractTable<TTable1> ? TTable1 : TInput extends AbstractTable<TTable2> ? TTable2 : never;
export type CheckFourTypes<TInput, TTable extends AbstractTable<TTable>, TTable1 extends AbstractTable<TTable1>, TTable2 extends AbstractTable<TTable2>, TTable3 extends AbstractTable<TTable3>> = TInput extends AbstractTable<TTable> ? TTable : TInput extends AbstractTable<TTable1> ? TTable1 : TInput extends AbstractTable<TTable2> ? TTable2 : TInput extends AbstractTable<TTable3> ? TTable3 : never;
export type CheckFiveTypes<TInput, TTable extends AbstractTable<TTable>, TTable1 extends AbstractTable<TTable1>, TTable2 extends AbstractTable<TTable2>, TTable3 extends AbstractTable<TTable3>, TTable4 extends AbstractTable<TTable4>> = TInput extends AbstractTable<TTable> ? TTable : TInput extends AbstractTable<TTable1> ? TTable1 : TInput extends AbstractTable<TTable2> ? TTable2 : TInput extends AbstractTable<TTable3> ? TTable3 : TInput extends AbstractTable<TTable4> ? TTable4 : never;
