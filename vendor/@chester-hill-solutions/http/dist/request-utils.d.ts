/**
 * Generic request and FormData helpers (framework-agnostic).
 */
type StringFieldOptions = {
    trim?: boolean;
    lowercase?: boolean;
};
export declare function getRequestUrl(request: Request): URL;
export declare function getRequestOrigin(request: Request): string;
export declare function getSearchParam(request: Request, name: string): string | null;
export declare function getSearchParams(request: Request): URLSearchParams;
export declare function getStringField(formData: FormData, name: string, options?: StringFieldOptions): string;
export declare function getOptionalStringField(formData: FormData, name: string, options?: StringFieldOptions): string | null;
export declare function getBooleanField(formData: FormData, name: string): boolean;
export declare function getIntField(formData: FormData, name: string): number | null;
export declare function getFloatField(formData: FormData, name: string): number | null;
export declare function decodeParamUntilStable(value: string): string;
export type PaginationParams = {
    page?: number;
    pageSize?: number;
};
export declare function getPaginationParams(searchParams: URLSearchParams, options?: {
    maxPageSize?: number;
}): PaginationParams;
export type SortParams = {
    sortBy?: string;
    sortOrder?: "asc" | "desc";
};
export declare function getSortParams(searchParams: URLSearchParams): SortParams;
export declare function getSearchTerm(searchParams: URLSearchParams, paramName?: string): string | undefined;
export {};
