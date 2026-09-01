/**
 * GST on accommodation, as India actually charges it.
 *
 * The rate is set by the *tariff per unit per night*, not by the total bill:
 *
 *   up to  ₹7,500  ->  12%
 *   above  ₹7,500  ->  18%
 *
 * These are the only rates a stay can attract. A free-text percentage box let
 * 25% be entered on HOS-1020 — a rate that does not exist — so the rate is now
 * a fixed choice, and the correct one is suggested from the nightly tariff.
 *
 * Food and beverage served in-villa is 5% GST as a restaurant supply, but when
 * billed to the room as part of an inclusive stay it follows the room rate.
 * That is a question for the property's accountant, not a default worth
 * guessing at, so the whole booking uses one rate.
 */
export const GST_RATES = [
  { value: 0, label: "0% — exempt", hint: "Only where the property is genuinely exempt" },
  { value: 5, label: "5%", hint: "Food and beverage billed separately" },
  { value: 12, label: "12%", hint: "Tariff up to ₹7,500 per night" },
  { value: 18, label: "18%", hint: "Tariff above ₹7,500 per night" },
] as const;

/** The rate the tariff implies. Advisory — the desk can still choose. */
export function suggestedGstRate(nightlyRate: number): 12 | 18 {
  return nightlyRate > 7500 ? 18 : 12;
}

export const isLegalGstRate = (percent: number) =>
  GST_RATES.some((rate) => rate.value === percent);
