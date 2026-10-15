export declare const CANADIAN_PROVINCE_ALIASES: {
    readonly NL: "NL";
    readonly NEWFOUNDLAND: "NL";
    readonly 'NEWFOUNDLAND AND LABRADOR': "NL";
    readonly PE: "PE";
    readonly PEI: "PE";
    readonly 'PRINCE EDWARD ISLAND': "PE";
    readonly NS: "NS";
    readonly 'NOVA SCOTIA': "NS";
    readonly NB: "NB";
    readonly 'NEW BRUNSWICK': "NB";
    readonly QC: "QC";
    readonly QUE: "QC";
    readonly QUEBEC: "QC";
    readonly QUÉBEC: "QC";
    readonly ON: "ON";
    readonly ONT: "ON";
    readonly ONTARIO: "ON";
    readonly MB: "MB";
    readonly MANITOBA: "MB";
    readonly SK: "SK";
    readonly SASKATCHEWAN: "SK";
    readonly AB: "AB";
    readonly ALBERTA: "AB";
    readonly BC: "BC";
    readonly 'BRITISH COLUMBIA': "BC";
    readonly YT: "YT";
    readonly YUKON: "YT";
    readonly NT: "NT";
    readonly 'NORTHWEST TERRITORIES': "NT";
    readonly NU: "NU";
    readonly NUNAVUT: "NU";
};
export type CanadianProvinceCode = (typeof CANADIAN_PROVINCE_ALIASES)[keyof typeof CANADIAN_PROVINCE_ALIASES];
/** Province names/aliases to two-letter codes. Numeric dataset IDs are deliberately excluded. */
export declare function normalizeCanadianProvinceCode(value: string | null | undefined): CanadianProvinceCode | undefined;
/** Format-shaped Canadian codes only; this does not establish postal assignment or deliverability. */
export declare function normalizeCanadianPostalCode(value: string | null | undefined): string | undefined;
