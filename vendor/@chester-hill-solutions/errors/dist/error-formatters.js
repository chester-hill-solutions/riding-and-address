/**
 * Generic user-facing error message formatters.
 */
export function formatDatabaseError(operation, entity, _error, identifier) {
    const entityContext = identifier ? `${entity} "${identifier}"` : entity;
    return `Failed to ${operation} ${entityContext}. Please try again or contact support if the issue persists.`;
}
export function formatNotFoundError(entity, identifier, additionalContext) {
    const baseMessage = `${entity} not found. The ${entity}${identifier ? ` "${identifier}"` : ""} may be invalid or may have been removed.`;
    return additionalContext ? `${baseMessage} ${additionalContext}` : baseMessage;
}
export function formatValidationError(field, reason) {
    return `${field}: ${reason}`;
}
export function formatApiError(operation, resourceType, error, identifier) {
    const resourceContext = identifier ? `${resourceType} (ID: ${identifier})` : resourceType;
    return `Failed to ${operation} ${resourceContext}. ${error}`;
}
export function formatLoadingError(resource, error) {
    const baseMessage = `Failed to load ${resource}. Please try again or contact support if the issue persists.`;
    return error ? `${baseMessage} ${error}` : baseMessage;
}
export function formatPermissionError(action, resource, identifier) {
    const resourceContext = identifier ? `${resource} "${identifier}"` : resource;
    return `You don't have permission to ${action} ${resourceContext}. Contact an administrator if you need access.`;
}
export function logErrorForAdmin(context, error, additionalData) {
    let errorMessage;
    let errorObject;
    if (error instanceof Error) {
        errorMessage = error.message;
        errorObject = error;
    }
    else if (typeof error === "string") {
        errorMessage = error;
        errorObject = new Error(error);
    }
    else if (error && typeof error === "object") {
        errorMessage =
            "message" in error ? String(error.message) : JSON.stringify(error);
        errorObject = error;
    }
    else {
        errorMessage = String(error ?? "Unknown error");
        errorObject = new Error(errorMessage);
    }
    console.error(`[${context}] Error: ${errorMessage}`, errorObject, additionalData || "");
}
