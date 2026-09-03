/**
 * All money in this system is stored and calculated as integer cents.
 *
 * Floating point dollars drift: 0.1 + 0.2 !== 0.3. On an estimate with a few
 * hundred line items that drift shows up as totals that don't foot, and margin
 * math that disagrees with the line items it was derived from. Every currency
 * value in the database is an integer number of cents; only the display layer
 * ever sees dollars.
 */

export type Cents = number;

/** Dollars (or a "12.34" string) -> integer cents. Rounds half away from zero. */
export function toCents(dollars: number | string | null | undefined): Cents {
  if (dollars === null || dollars === undefined || dollars === "") return 0;
  const n = typeof dollars === "string" ? Number(dollars.replace(/[$,\s]/g, "")) : dollars;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Integer cents -> dollars as a number. For display/serialisation only. */
export function toDollars(cents: Cents): number {
  return Math.round(cents) / 100;
}

/** Integer cents -> "$1,234.56". */
export function formatMoney(cents: Cents | null | undefined, opts: { cents?: boolean } = {}): string {
  const v = toDollars(cents ?? 0);
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents === false ? 0 : 2,
    maximumFractionDigits: opts.cents === false ? 0 : 2,
  });
}

/**
 * Multiply cents by a decimal factor (quantity, multiplier, percentage) and
 * return integer cents. Rounding happens once, at the end of the product.
 */
export function multiplyCents(cents: Cents, factor: number): Cents {
  if (!Number.isFinite(factor)) return 0;
  return Math.round(cents * factor);
}

/** Sum a list of cent values. */
export function sumCents(values: Array<Cents | null | undefined>): Cents {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

/** Apply a percentage (25 means 25%) to a cents value. */
export function percentOf(cents: Cents, percent: number): Cents {
  return multiplyCents(cents, percent / 100);
}

/**
 * Gross-margin pricing: sell = cost / (1 - margin).
 * A 30% target gross margin means cost is divided by 0.70 -- this is NOT the
 * same as adding a 30% markup (which would only yield a 23% margin).
 */
export function priceAtMargin(costCents: Cents, marginPercent: number): Cents {
  const m = marginPercent / 100;
  if (m >= 1) throw new Error(`Gross margin must be below 100% (received ${marginPercent}%)`);
  if (m <= -1) throw new Error(`Gross margin is implausibly negative (${marginPercent}%)`);
  return Math.round(costCents / (1 - m));
}

/** The realised gross margin percent for a given cost and sell price. */
export function marginOf(costCents: Cents, sellCents: Cents): number {
  if (sellCents === 0) return 0;
  return round((sellCents - costCents) / sellCents * 100, 2);
}

/** Round a non-money number to n decimal places. */
export function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
}
