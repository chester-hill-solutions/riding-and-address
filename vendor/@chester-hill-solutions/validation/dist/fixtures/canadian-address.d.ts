/** Shared compatibility vectors for address producers and consumers. */
export declare const canadianAddressFixtures: readonly [{
    readonly postal: "m5v2t6";
    readonly province: "ontario";
    readonly expectedPostal: "M5V 2T6";
    readonly expectedProvince: "ON";
}, {
    readonly postal: " h2y  1c6 ";
    readonly province: " Québec ";
    readonly expectedPostal: "H2Y 1C6";
    readonly expectedProvince: "QC";
}, {
    readonly postal: "v8v1x4";
    readonly province: "British Columbia";
    readonly expectedPostal: "V8V 1X4";
    readonly expectedProvince: "BC";
}, {
    readonly postal: "c1a1a1";
    readonly province: "PEI";
    readonly expectedPostal: "C1A 1A1";
    readonly expectedProvince: "PE";
}, {
    readonly postal: "K1A\t0B1";
    readonly province: "on";
    readonly expectedPostal: "K1A 0B1";
    readonly expectedProvince: "ON";
}];
