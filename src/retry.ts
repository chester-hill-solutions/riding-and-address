import { getRetryConfig } from './config';

/**
 * Running an async operation with a retry policy and a deadline.
 *
 * **Moved out of `src/utils.ts` for the same reason as the validation helpers.**
 *
 * `dataset-source.ts` needed `withRetry`, so it imported `utils.ts`, and that was the edge
 * that closed the datasets/cache cycle.
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

/**
 * Sanitizes a string input by removing control characters and limiting length.
 * 
 * @param input - The string to sanitize
 * @param maxLength - Maximum allowed length (default: 1000)
 * @returns Sanitized string or undefined if input is empty/invalid
 */
/**
 * Error class for non-retriable failures (e.g., validation errors, missing config).
 * When thrown inside withRetry, the operation will not be retried.
 */
export class NonRetriableError extends Error {
  nonRetriable: boolean;
  constructor(message: string) {
    super(message);
    this.name = 'NonRetriableError';
    this.nonRetriable = true;
  }
}

/**
 * Executes an async operation with automatic retry logic using exponential backoff.
 * 
 * @param operation - The async function to execute
 * @param config - Retry configuration (maxAttempts, baseDelay, maxDelay, backoffMultiplier, jitter)
 * @param context - Context string for logging purposes
 * @returns The result of the operation
 * @throws The last error if all retry attempts fail
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = getRetryConfig(),
  context: string = 'operation'
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Do not retry non-retriable errors
      if ((lastError as { nonRetriable?: boolean })?.nonRetriable) {
        console.error(`${context} failed with non-retriable error:`, lastError.message);
        throw lastError;
      }
      
      if (attempt === config.maxAttempts) {
        console.error(`${context} failed after ${config.maxAttempts} attempts:`, lastError.message);
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );
      
      // Add jitter to prevent thundering herd
      const jitteredDelay = config.jitter 
        ? delay + Math.random() * 1000 
        : delay;
      
      console.warn(`${context} attempt ${attempt} failed, retrying in ${Math.round(jitteredDelay)}ms:`, lastError.message);
      await new Promise(resolve => setTimeout(resolve, jitteredDelay));
    }
  }
  
  throw lastError!;
}

/**
 * Wraps a promise with a timeout, rejecting if the operation takes too long.
 * 
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout duration in milliseconds
 * @param operation - Operation name for error messages
 * @returns The result of the promise if it completes within the timeout
 * @throws Error if the operation times out
 */
/**
 * Thrown when a stage exceeds its budget. Callers branch on the type, never on message text, so a
 * timeout can be counted and reported without string matching.
 */
export class TimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timeout after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new TimeoutError(operation, timeoutMs)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

