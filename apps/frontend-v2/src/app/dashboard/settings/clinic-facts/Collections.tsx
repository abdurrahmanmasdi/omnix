"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClinicFactsDto } from "@/lib/api/model";

export function Collections({
  facts,
  change,
  disabled,
}: {
  facts: ClinicFactsDto;
  change: (next: ClinicFactsDto) => void;
  disabled: boolean;
}) {
  const t = useTranslations("ClinicFacts");
  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold">{t("treatments")}</h2>
        {facts.treatments.map((row, index) => (
          <fieldset
            key={index}
            disabled={disabled}
            className="grid gap-3 border-b border-border pb-4 md:grid-cols-2"
          >
            {(
              [
                "name",
                "priceMin",
                "priceMax",
                "currency",
                "unit",
                "included",
              ] as const
            ).map((key) => (
              <label key={key} className="grid gap-1">
                {t(key)}
                {key === "currency" ? (
                  <select
                    className="rounded-md border border-border bg-background p-2"
                    value={row.currency}
                    onChange={(e) =>
                      change({
                        ...facts,
                        treatments: facts.treatments.map((r, i) =>
                          i === index
                            ? {
                                ...r,
                                currency: e.target.value as typeof row.currency,
                              }
                            : r,
                        ),
                      })
                    }
                  >
                    {["EUR", "USD", "TRY", "GBP"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type={
                      key === "priceMin" || key === "priceMax"
                        ? "number"
                        : "text"
                    }
                    min={0}
                    step="any"
                    value={row[key]}
                    onChange={(e) =>
                      change({
                        ...facts,
                        treatments: facts.treatments.map((r, i) =>
                          i === index
                            ? {
                                ...r,
                                [key]:
                                  key === "priceMin" || key === "priceMax"
                                    ? Number(e.target.value)
                                    : e.target.value,
                              }
                            : r,
                        ),
                      })
                    }
                  />
                )}
              </label>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                change({
                  ...facts,
                  treatments: facts.treatments.filter((_, i) => i !== index),
                })
              }
            >
              {t("remove")}
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={disabled || facts.treatments.length >= 50}
          onClick={() =>
            change({
              ...facts,
              treatments: [
                ...facts.treatments,
                {
                  name: "",
                  priceMin: 0,
                  priceMax: 0,
                  currency: "EUR",
                  unit: "",
                  included: "",
                },
              ],
            })
          }
        >
          {t("addTreatment")}
        </Button>
      </section>
      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold">{t("doctors")}</h2>
        {facts.doctors.map((row, index) => (
          <fieldset
            key={index}
            disabled={disabled}
            className="grid gap-3 border-b border-border pb-4 md:grid-cols-3"
          >
            {(["name", "role", "years"] as const).map((key) => (
              <label key={key} className="grid gap-1">
                {t(key)}
                <Input
                  type={key === "years" ? "number" : "text"}
                  min={0}
                  step={1}
                  value={row[key]}
                  onChange={(e) =>
                    change({
                      ...facts,
                      doctors: facts.doctors.map((r, i) =>
                        i === index
                          ? {
                              ...r,
                              [key]:
                                key === "years"
                                  ? Number(e.target.value)
                                  : e.target.value,
                            }
                          : r,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                change({
                  ...facts,
                  doctors: facts.doctors.filter((_, i) => i !== index),
                })
              }
            >
              {t("remove")}
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={disabled || facts.doctors.length >= 50}
          onClick={() =>
            change({
              ...facts,
              doctors: [...facts.doctors, { name: "", role: "", years: 0 }],
            })
          }
        >
          {t("addDoctor")}
        </Button>
      </section>
      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold">{t("offers")}</h2>
        <p className="text-muted-foreground">{t("offerHelp")}</p>
        {facts.offers.map((row, index) => (
          <fieldset
            key={index}
            disabled={disabled}
            className="grid gap-3 border-b border-border pb-4 md:grid-cols-2"
          >
            <label className="grid gap-1">
              {t("offerText")}
              <Input
                value={row.text}
                onChange={(e) =>
                  change({
                    ...facts,
                    offers: facts.offers.map((r, i) =>
                      i === index ? { ...r, text: e.target.value } : r,
                    ),
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) =>
                  change({
                    ...facts,
                    offers: facts.offers.map((r, i) =>
                      i === index ? { ...r, enabled: e.target.checked } : r,
                    ),
                  })
                }
              />
              {t("enabled")}
            </label>
            {(["validFrom", "validTo"] as const).map((key) => (
              <label key={key} className="grid gap-1">
                {t(key)}
                <Input
                  type="datetime-local"
                  value={localDate(row[key])}
                  required
                  onChange={(e) =>
                    change({
                      ...facts,
                      offers: facts.offers.map((r, i) =>
                        i === index
                          ? {
                              ...r,
                              [key]: e.target.value
                                ? new Date(e.target.value).toISOString()
                                : "",
                            }
                          : r,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                change({
                  ...facts,
                  offers: facts.offers.filter((_, i) => i !== index),
                })
              }
            >
              {t("remove")}
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={disabled || facts.offers.length >= 20}
          onClick={() =>
            change({
              ...facts,
              offers: [
                ...facts.offers,
                { text: "", enabled: false, validFrom: "", validTo: "" },
              ],
            })
          }
        >
          {t("addOffer")}
        </Button>
      </section>
    </div>
  );
}
function localDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
