import {
  PgColumn,
  PgTable,
  PgTableWithColumns,
} from '../postgresql-core/schema';
import { PgResult } from '../postgresql-core/types';
import {
  PgSelect,
  PgSelectConfig,
} from '../postgresql-core/select';

// ... (outros imports existentes)

/**
 * Note: This is a conceptual fix based on the reported bug.
 * The core issue is in how the result mapper handles nested objects.
 * We need to ensure that the nested object is not set to null just because the first column is null.
 */

function mapNestedObject(columns: any[], row: any[]) {
  const result: any = {};
  let hasValue = false;

  for (const col of columns) {
    const value = row[col.index];
    if (value !== null) {
      hasValue = true;
    }
    result[col.name] = value;
  }

  return hasValue ? result : null;
}

// A implementação real dentro do loop de processamento de rows do Drizzle:
// Onde anteriormente existia algo como:
// if (firstColumnValue === null) return null;
// Agora deve-se validar a existência de qualquer valor no grupo de colunas do objeto aninhado.

export function mapPgSelectResults(
  columns: any[],
  rows: any[]
) {
  return rows.map((row) => {
    const result: any = {};
    
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      
      if (col.type === 'nested') {
        const nestedCols = col.columns;
        const nestedValues = nestedCols.map(nc => row[nc.index]);
        const hasAnyValue = nestedValues.some(v => v !== null);
        
        if (hasAnyValue) {
          const nestedObj: any = {};
          nestedCols.forEach(nc => {
            nestedObj[nc.name] = row[nc.index];
          });
          result[col.name] = nestedObj;
        } else {
          result[col.name] = null;
        }
      } else {
        result[col.name] = row[col.index];
      }
    }
    
    return result;
  });
}
