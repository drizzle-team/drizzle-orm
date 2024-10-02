import { is, SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { entityName, fmtValue, Table } from './utils';
import { SchemaValidationErrors, ValidationError } from './errors';
import { vectorOps } from 'src/extensions/vector';

export class ValidateIndex {
  constructor(private errors: ValidationError[], private errorCodes: Set<number>, private schema: string | undefined, private name: string) {}

  /** PG only */
  requiresName(columns: Table['indexes'][number]['columns'], dialect: PgDialect) {
    for (const column of columns) {
      if (is(column, SQL)) {
        this.errors.push({
          message: `Cannot automatically assign name to index in table ${entityName(this.schema, this.name, true)} with expression ${fmtValue(dialect.sqlToQuery(column).sql, true)}`,
          hint: `Indexes that contain a SQL expression within the ${fmtValue('`.on()`', false)} method cannot be automatically named. Manually assign a name to the index`
        });
        this.errorCodes.add(SchemaValidationErrors.IndexRequiresName);
        break;
      }
    }

    return this;
  }

  /** PG only */
  vectorColumnRequiresOp(columns: Table['indexes'][number]['columns']) {
    for (const column of columns) {
      if (!is(column, SQL) && column.type === 'PgVector' && column.op === undefined) {
        this.errors.push({
          message: `Vector column ${entityName(undefined, column.name, true)} in index ${entityName(this.schema, this.name, true)} requires an operator class`,
          hint: `The pgvector extension does not provide a default operator class for vector columns. You must specify an operator class.\nThe following operator classes are available in Drizzle: ${vectorOps.map((op) => fmtValue(op, true)).join(', ')}.\nAn operator class can be added as such: ${fmtValue(`\`index("index_name").on(table.column.op("${vectorOps[0]}"))\``, false)}`
        });
        this.errorCodes.add(SchemaValidationErrors.IndexVectorColumnRequiresOp);
      }
    }

    return this;
  }
}
