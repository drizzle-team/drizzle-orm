import client from 'postgres';
import { entityKind } from '~/entity.ts';
import { DrizzleTracer, type TracedQuery, type TracedTransaction } from '~/tracer.ts';
import { type PgErrorDetails, PgError } from '~/pg-core/errors.ts';

export abstract class PostgresJsTracer extends DrizzleTracer {
  static override readonly [entityKind]: string = 'PostgresJsTracer';

  private static mapDetails(err: client.PostgresError): PgErrorDetails {
    return {
      code: err.code,
      message: err.message,
      file: err.file,
      line: err.line,
      routine: err.routine,
      position: err.position,
      severity: err.severity,
      severityLocal: err.severity_local,
      columnName: err.column_name,
      constraintName: err.constraint_name,
      dataTypeName: err.table_name,
      detail: err.detail,
      hint: err.hint,
      internalPosition: err.internal_position,
      internalQuery: err.internal_query,
      schemaName: err.schema_name,
      tableName: err.table_name,
      where: err.where
    };
  }

  static override handleQueryError(err: unknown, queryString: string, queryParams: any[], duration: number): never {
    if (err instanceof client.PostgresError) {
      const query: TracedQuery = {
        sql: queryString,
        params: queryParams,
        duration
      };
      const details = this.mapDetails(err);
      throw new PgError(err, { ...details, query });
    }
    throw err;
  };

  static override handleTransactionError(err: unknown, transactionId: string, type: 'transaction' | 'savepoint', duration: number): never {
    if (err instanceof client.PostgresError) {
      const transaction: TracedTransaction = {
        name: transactionId,
        duration,
        type
      };
      const details = this.mapDetails(err);
      throw new PgError(err, { ...details, transaction });
    }
    throw err;
  };
}
