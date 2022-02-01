/* eslint-disable max-classes-per-file */
export default abstract class Expr {
  abstract toQuery(position?: number): { query: string, values: Array<any> };
}

// export abstract class ConstantExpr {
//   abstract toQuery(position: number): { query: string, values: Array<any>, constant: number };
// }
