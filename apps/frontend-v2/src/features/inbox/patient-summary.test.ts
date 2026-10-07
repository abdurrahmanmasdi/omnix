import { expect, it } from "vitest";
import { patientSummary } from "./patient-summary";
it("preserves legacy summaries and handles a redacted summary", () => {
  expect(patientSummary("Legacy synthetic summary").summary).toBe(
    "Legacy synthetic summary",
  );
  expect(patientSummary(null)).toMatchObject({
    summary: "",
    handoffSummary: null,
    mood: null,
  });
});
it("reads only valid contract-summary patient facts", () => {
  expect(
    patientSummary(
      JSON.stringify({
        format: "omnix.patient-summary.v1",
        summary: "Needs crowns",
        handoffSummary: "Staff to confirm",
        facts: {
          treatmentInterest: "Crowns",
          travelWindow: "November",
          photoSent: false,
          mood: "anxious",
        },
      }),
    ),
  ).toEqual({
    summary: "Needs crowns",
    handoffSummary: "Staff to confirm",
    treatmentInterest: "Crowns",
    travelWindow: "November",
    photoSent: false,
    mood: "anxious",
  });
  expect(
    patientSummary(
      JSON.stringify({
        format: "omnix.patient-summary.v1",
        summary: "Text",
        facts: {
          mood: "invented",
          photoSent: "yes",
          travelWindow: { unsafe: true },
        },
      }),
    ),
  ).toMatchObject({ mood: null, photoSent: null, travelWindow: null });
});
