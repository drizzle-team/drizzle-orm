import { wrapError } from '../errors';

// Exemplo de aplicação no método de execução de query
async function executeQuery(query: any) {
  try {
    // Lógica de execução existente
    return await driver.execute(query);
  } catch (error) {
    throw wrapError(error, 'QueryExecution');
  }
}
