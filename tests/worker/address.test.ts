import { describe, expect, it } from "vitest";

import { composeAddressLines } from "@/worker/services/documents";

describe("company address lines", () => {
  it("prints at most three lines", () => {
    expect(
      composeAddressLines({
        address_line1: "No.25 Jalan Seroja 7/1",
        address_line2: "Taman Seroja",
        postcode: "43900",
        city: "Bandar Baru Salak Tinggi",
        state: "Selangor Darul Ehsan",
      }),
    ).toEqual([
      "No.25 Jalan Seroja 7/1, Taman Seroja",
      "43900 Bandar Baru Salak Tinggi",
      "Selangor Darul Ehsan",
    ]);
  });

  it("skips empty parts without leaving blank lines", () => {
    expect(
      composeAddressLines({
        address_line1: "12 Jalan Satu",
        postcode: "50450",
        city: "Kuala Lumpur",
        state: "Wilayah Persekutuan",
      }),
    ).toEqual(["12 Jalan Satu", "50450 Kuala Lumpur", "Wilayah Persekutuan"]);
  });
});
