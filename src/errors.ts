export class DrizzleError extends Error {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = 'DrizzleError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DrizzleError);
    }
  }
}

export class DrizzleQueryError extends DrizzleError {
  constructor(message: string, originalError?: any) {
    super(message, originalError);
    this.name = 'DrizzleQueryError';
  }
}

export class DrizzleConnectionError extends DrizzleError {
  constructor(message: string, originalError?: any) {
    super(message, originalError);
    this.name = 'DrizzleConnectionError';
  }
}

export function wrapError(error: any, contextMessage: string): Error {
  if (error instanceof DrizzleError) return error;
  
  // Avoid wrapping internal JS errors like TypeError or ReferenceError
  if (error instanceof TypeError || error instanceof ReferenceError) {
    return error;
  }

  return new DrizzleQueryError(`${contextMessage}: ${error.message}`, error);
}
