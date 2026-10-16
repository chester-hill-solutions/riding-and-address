/**
 * Generic user-facing error message formatters.
 */
export declare function formatDatabaseError(operation: string, entity: string, _error: unknown, identifier?: string): string;
export declare function formatNotFoundError(entity: string, identifier: string, additionalContext?: string): string;
export declare function formatValidationError(field: string, reason: string): string;
export declare function formatApiError(operation: string, resourceType: string, error: string, identifier?: string): string;
export declare function formatLoadingError(resource: string, error?: string): string;
export declare function formatPermissionError(action: string, resource: string, identifier?: string): string;
export declare function logErrorForAdmin(context: string, error: unknown, additionalData?: Record<string, unknown>): void;
