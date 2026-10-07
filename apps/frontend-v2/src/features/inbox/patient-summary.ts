// Facts without contract-v1 fields live in the existing summary string.
export type PatientSummary = {
  summary: string;
  handoffSummary: string | null;
  treatmentInterest: string | null;
  travelWindow: string | null;
  photoSent: boolean | null;
  mood: "calm" | "anxious" | "frustrated" | "angry" | "urgent" | null;
};
export function patientSummary(value: string | null): PatientSummary {
  const legacy: PatientSummary = {
    summary: value ?? "",
    handoffSummary: null,
    treatmentInterest: null,
    travelWindow: null,
    photoSent: null,
    mood: null,
  };
  try {
    const data = JSON.parse(value ?? "");
    if (
      data?.format !== "omnix.patient-summary.v1" ||
      typeof data.summary !== "string" ||
      !data.facts ||
      typeof data.facts !== "object"
    )
      return legacy;
    const text = (v: unknown) => (typeof v === "string" ? v : null);
    return {
      summary: data.summary,
      handoffSummary: text(data.handoffSummary),
      treatmentInterest: text(data.facts.treatmentInterest),
      travelWindow: text(data.facts.travelWindow),
      photoSent:
        typeof data.facts.photoSent === "boolean" ? data.facts.photoSent : null,
      mood: ["calm", "anxious", "frustrated", "angry", "urgent"].includes(
        data.facts.mood,
      )
        ? data.facts.mood
        : null,
    };
  } catch {
    return legacy;
  }
}
