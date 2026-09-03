import type { NormalizedPlayground } from "./types";

/**
 * Manufacturer quote parsing -- phase 5 of the build order.
 *
 * The interface is defined now so that source documents can be uploaded and
 * stored from day one, and so the estimate screen already has a place to
 * receive parsed lines. No parser is implemented yet: the manufacturers each
 * lay their quotes out differently, and writing one against a guess rather
 * than against real Landscape Structures, Anova and Dumor documents would only
 * produce something that has to be thrown away.
 *
 * Until then the same shape is produced by hand on the estimate screen, so
 * nothing downstream needs to change when a parser is added.
 */

export interface ParsedQuoteLine {
  partNumber?: string;
  description?: string;
  quantity: number;
  weightLb?: number;
  unitPriceCents?: number;
}

export interface ParsedQuote {
  manufacturerName?: string;
  modelNumber?: string;
  modelDescription?: string;
  ageRange?: string;
  quoteNumber?: string;
  quoteDate?: Date;
  summary?: {
    laborHours?: number;
    footingCount?: number;
    concreteCuFt?: number;
    totalWeightLb?: number;
    safetyZoneSqFt?: number;
  };
  lines: ParsedQuoteLine[];
  /** Anything the parser could not interpret, kept for human review. */
  unparsed: string[];
}

export interface QuoteParser {
  /** Manufacturer document convention this parser understands. */
  parserType: string;
  canParse(input: { fileName: string; mimeType?: string; text?: string }): boolean;
  parse(input: { fileName: string; buffer: Buffer; text?: string }): Promise<ParsedQuote>;
}

const registry = new Map<string, QuoteParser>();

export function registerParser(parser: QuoteParser): void {
  registry.set(parser.parserType, parser);
}

export function getParser(parserType: string): QuoteParser | undefined {
  return registry.get(parserType);
}

export function listParsers(): string[] {
  return [...registry.keys()];
}

export class ParserNotImplementedError extends Error {
  constructor(parserType: string) {
    super(
      `No quote parser is registered for "${parserType}". Enter the components by hand, or import them ` +
        "with the CSV importer, until a parser has been written against a real quote from this manufacturer.",
    );
    this.name = "ParserNotImplementedError";
  }
}

export async function parseQuote(
  parserType: string,
  input: { fileName: string; buffer: Buffer; text?: string },
): Promise<ParsedQuote> {
  const parser = getParser(parserType);
  if (!parser) throw new ParserNotImplementedError(parserType);
  return parser.parse(input);
}

/** Placeholder so the type is exercised; replaced when a real parser lands. */
export type ParsedToNormalized = (quote: ParsedQuote) => Promise<NormalizedPlayground>;
