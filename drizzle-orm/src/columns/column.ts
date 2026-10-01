// Nota: Esta é uma representação simplificada da lógica de integração. 
// No Drizzle, a lógica de seleção de colunas geralmente reside no Query Builder ou no Schema Mapper.
// Precisamos garantir que se a coluna for do tipo 'custom' e possuir 'selectFromDb', ela seja utilizada.

import { SQL, sql } from '../sql';

export interface Column {
  name: string;
  type: any;
  // ... outras propriedades
}

export function resolveColumnSelection(column: Column): SQL {
  const type = column.type;
  
  if (type && typeof type === 'object' && 'selectFromDb' in type && typeof type.selectFromDb === 'function') {
    // @ts-ignore - decoder is the custom type object itself which contains fromDriver/toDriver
    return type.selectFromDb(column.name, type);
  }

  return sql.identifier(column.name);
}
