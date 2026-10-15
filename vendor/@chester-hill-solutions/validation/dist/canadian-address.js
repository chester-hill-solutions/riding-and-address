import { isValidCanadianPostalCode, normalizePostalCode } from "./normalization.js";
export const CANADIAN_PROVINCE_ALIASES = {
    NL: 'NL',
    NEWFOUNDLAND: 'NL',
    'NEWFOUNDLAND AND LABRADOR': 'NL',
    PE: 'PE',
    PEI: 'PE',
    'PRINCE EDWARD ISLAND': 'PE',
    NS: 'NS',
    'NOVA SCOTIA': 'NS',
    NB: 'NB',
    'NEW BRUNSWICK': 'NB',
    QC: 'QC',
    QUE: 'QC',
    QUEBEC: 'QC',
    QUÉBEC: 'QC',
    ON: 'ON',
    ONT: 'ON',
    ONTARIO: 'ON',
    MB: 'MB',
    MANITOBA: 'MB',
    SK: 'SK',
    SASKATCHEWAN: 'SK',
    AB: 'AB',
    ALBERTA: 'AB',
    BC: 'BC',
    'BRITISH COLUMBIA': 'BC',
    YT: 'YT',
    YUKON: 'YT',
    NT: 'NT',
    'NORTHWEST TERRITORIES': 'NT',
    NU: 'NU',
    NUNAVUT: 'NU',
};
/** Province names/aliases to two-letter codes. Numeric dataset IDs are deliberately excluded. */
export function normalizeCanadianProvinceCode(value) {
    if (!value)
        return undefined;
    const key = value.trim().normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
    if (!Object.hasOwn(CANADIAN_PROVINCE_ALIASES, key))
        return undefined;
    return CANADIAN_PROVINCE_ALIASES[key];
}
/** Format-shaped Canadian codes only; this does not establish postal assignment or deliverability. */
export function normalizeCanadianPostalCode(value) {
    if (!value || !isValidCanadianPostalCode(value))
        return undefined;
    return normalizePostalCode(value, true);
}
