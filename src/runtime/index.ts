import { wrapError } from '../errors';

// Simulando a aplicação do wrapper no fluxo de execução de queries
// Este é um exemplo de como o wrapError deve ser integrado nos executors de query do ORM
export async function executeQuery<T>(queryFn: () => Promise<T>, context: string): Promise<T> {
  try {
    return await queryFn();
  } catch (error) {
    throw wrapError(error, context);
  }
}
