/** Shared compatibility vectors for address producers and consumers. */
export const canadianAddressFixtures = [
    { postal: "a1b2c3", province: "Newfoundland and Labrador", expectedPostal: "A1B 2C3", expectedProvince: "NL" },
    { postal: "m5v2t6", province: "ontario", expectedPostal: "M5V 2T6", expectedProvince: "ON" },
    { postal: " h2y  1c6 ", province: " Québec ", expectedPostal: "H2Y 1C6", expectedProvince: "QC" },
    { postal: "v8v1x4", province: "British Columbia", expectedPostal: "V8V 1X4", expectedProvince: "BC" },
    { postal: "c1a1a1", province: "PEI", expectedPostal: "C1A 1A1", expectedProvince: "PE" },
    { postal: "K1A\t0B1", province: "on", expectedPostal: "K1A 0B1", expectedProvince: "ON" },
];
