export class DrizzleError extends Error {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = 'DrizzleError';
    Object.setPrototypeOf(this, DrizzleError.prototype);
  }
}

export class DrizzleConnectionError extends DrizzleError {
  constructor(message: string, originalError?: any) {
    super(message, originalError);
    this.name = 'DrizzleConnectionError';
    Object.setPrototypeOf(this, DrizzleConnectionError.prototype);
  }
}

export class DrizzleQueryError extends DrizzleError {
  constructor(message: string, originalError?: any) {
    super(message, originalError);
    this.name = 'DrizzleQueryError';
    Object.setPrototypeOf(this, DrizzleQueryError.prototype);
  }
}

export function wrapError(error: any, context: string): Error {
  if (error instanceof DrizzleError) return error;

  const message = `[${context}] ${error instanceof Error ? error.message : String(error)}`;
  
  if (message.includes('connection') || message.includes('network') || message.includes('ECONNREFUSED')) {
    return new DrizzleConnectionError(message, error);
  }

  return new DrizzleQueryError(message, error);
}
