import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import { ExtractCodeType } from '../../../tables/inferTypes';
import And from './and';
import Const from './const';
import ConstArray from './constArray';
import EqWhere from './eqWhere';
import Greater from './greater';
import GreaterEq from './greaterEq';
import In from './in';
import IsNull from './isNull';
import Less from './less';
import LessEq from './lessEq';
import Like from './like';
import NotEqWhere from './notEqWhere';
import Or from './or';
import RawWhere from './rawWhere';
import Var from './var';
import Expr from './where';

// eslint-disable-next-line max-len
export const eq = <T extends AbstractColumn<ColumnType<any>, boolean, boolean>>(
  left: T, value: ExtractCodeType<T>): Expr => new EqWhere(new Var<T>(left), new Const(value));

export const raw = (customQuery: string): Expr => new RawWhere(customQuery);

export const and = (expressions: Expr[]): Expr => new And(expressions);

export const or = (expressions: Expr[]): Expr => new Or(expressions);

export const like = <T extends AbstractColumn<ColumnType<any>, boolean, boolean>>(left: T,
  value: ExtractCodeType<T>): Expr => new Like(new Var<T>(left), new Const(value));

export const inArray = <T extends AbstractColumn<ColumnType<any>, boolean, boolean>>(left: T,
  value: ExtractCodeType<T>[]): Expr => new In(new Var<T>(left), new ConstArray(value));

export const greater = <T extends AbstractColumn<ColumnType<any>, boolean, boolean>>(left: T,
  value: ExtractCodeType<T>)
  : Expr => new Greater({ left: new Var<T>(left), right: new Const(value) });

export const less = <T extends AbstractColumn<ColumnType<any>, boolean, boolean>>(left: T,
  value: ExtractCodeType<T>): Expr => new Less({ left: new Var<T>(left), right: new Const(value) });

export const greaterEq = <T extends AbstractColumn<ColumnType<any>, boolean, boolean>>(left: T,
  value: ExtractCodeType<T>)
  : Expr => new GreaterEq({ left: new Var<T>(left), right: new Const(value) });

export const lessEq = <T extends AbstractColumn<ColumnType<any>, boolean, boolean>>(left: T,
  value: ExtractCodeType<T>)
  : Expr => new LessEq({ left: new Var<T>(left), right: new Const(value) });

export const isNull = <T extends AbstractColumn<ColumnType<any>, boolean, boolean>>(
  left: T): Expr => new IsNull(new Var<T>(left));

export const notEq = <T extends AbstractColumn<ColumnType<any>, boolean, boolean>>(
  left: T, value: ExtractCodeType<T>): Expr => new NotEqWhere(new Var<T>(left), new Const(value));
