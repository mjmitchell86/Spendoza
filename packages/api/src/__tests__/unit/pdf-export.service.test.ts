import { describe, it, expect, mock } from "bun:test";

// Mock supabase
mock.module("../../lib/supabase", () => ({
  supabaseAdmin: { from: () => ({}) },
}));

// Mock services
mock.module("../../services/report.service", () => ({
  generateUserReport: mock(() => Promise.resolve(null)),
  generateHouseholdReport: mock(() => Promise.resolve(null)),
}));

mock.module("../../services/pdf-report.service", () => ({
  buildReportPdf: mock(() => Promise.resolve(Buffer.from("fake-pdf"))),
}));

const { generatePersonalPdfForUser, generateHouseholdPdfForHousehold } =
  await import("../../services/pdf-export.service");

describe("pdf-export.service", () => {
  it("exports generatePersonalPdfForUser", () => {
    expect(typeof generatePersonalPdfForUser).toBe("function");
  });

  it("exports generateHouseholdPdfForHousehold", () => {
    expect(typeof generateHouseholdPdfForHousehold).toBe("function");
  });
});
