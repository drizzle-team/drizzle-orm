import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import { ExtractCodeType } from '../../../tables/inferTypes';
import Combine from './combine';
import Increment from './increment';
import SetObject from './setObjects';
import { UpdateCustomExpr, UpdateExpr } from './updates';

export const set = <T extends AbstractColumn<ColumnType<any>, boolean, boolean>>(column: T,
  value: ExtractCodeType<T>): UpdateExpr => new SetObject<T>(column, value);

export const incrementBy = <T extends AbstractColumn<ColumnType<any>, boolean, boolean>>(
  value: number): UpdateCustomExpr<T> => new Increment<T>(value);

export const combine = (updates: Array<UpdateExpr>): UpdateExpr => new Combine(updates);
