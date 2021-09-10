import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import { ExtractCodeType } from '../../../tables/inferTypes';
import Combine from './combine';
import SetObject from './setObjects';
import UpdateExpr from './updates';

export const set = <T extends AbstractColumn<ColumnType<any>, boolean, boolean>>(column: T,
  value: ExtractCodeType<T>): UpdateExpr => new SetObject<T>(column, value);

export const combine = (updates: Array<UpdateExpr>): UpdateExpr => new Combine(updates);
