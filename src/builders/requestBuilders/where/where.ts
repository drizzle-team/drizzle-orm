/* eslint-disable max-classes-per-file */
export default abstract class Expr {
  abstract toQuery(position?: number, tableCache?: {[tableName: string]: string})
  : { query: string, values: Array<any> };
}
