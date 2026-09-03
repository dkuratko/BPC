import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { Manufacturer, PGAssembly, PGComponent } from "@/models";
import { toCents } from "@/lib/money";

/**
 * CSV import for the component and assembly libraries.
 *
 * Typing a few hundred part numbers by hand is the thing most likely to stop
 * this system being used, so the importer is deliberately forgiving: it matches
 * headers case- and space-insensitively, upserts on manufacturer + part number
 * so a corrected file can be re-run, and reports every row it could not take
 * rather than failing the whole file.
 */

/** Minimal RFC 4180 parser: handles quoted fields, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const normalized = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += char;
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === ",") { row.push(field); field = ""; continue; }
    if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[\s_-]/g, "");

export function toRecords(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((h, i) => [h, (row[i] ?? "").trim()])),
  );
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

export interface ImportResult {
  created: number;
  updated: number;
  skipped: Array<{ row: number; reason: string; data?: Record<string, string> }>;
}

export const COMPONENT_CSV_HEADERS = [
  "partNumber", "name", "category", "subcategory", "description", "weightLb",
  "baseLaborHours", "footingCount", "concreteCuFt", "complexity", "tags", "notes",
  "manufacturerListPrice",
];

/**
 * Import components for one manufacturer. Hours supplied in the file are taken
 * as measured ("manual"); rows without hours are left for the weight-based
 * inference to fill in, and flagged as unverified on every estimate that uses them.
 */
export async function importComponents(
  csvText: string,
  manufacturerId: string,
): Promise<ImportResult> {
  await connectDb();
  const manufacturer = await Manufacturer.findById(manufacturerId);
  if (!manufacturer) throw new Error("Manufacturer not found");

  const records = toRecords(csvText);
  const result: ImportResult = { created: 0, updated: 0, skipped: [] };

  for (const [index, record] of records.entries()) {
    const partNumber = record.partnumber || record.part || record.sku;
    const name = record.name || record.description;

    if (!partNumber || !name) {
      result.skipped.push({
        row: index + 2,
        reason: "A part number and a name are both required.",
        data: record,
      });
      continue;
    }

    const hours = num(record.baselaborhours ?? record.laborhours);
    const update = {
      manufacturerId: new Types.ObjectId(manufacturerId),
      partNumber,
      name,
      category: record.category || undefined,
      subcategory: record.subcategory || undefined,
      description: record.description || undefined,
      weightLb: num(record.weightlb ?? record.weight),
      installation: {
        baseLaborHours: hours,
        laborSource: hours !== undefined ? "manual" : "inferred_weight",
        verified: hours !== undefined,
        footingCount: num(record.footingcount ?? record.footings),
        concreteCuFt: num(record.concretecuft),
        complexity: num(record.complexity) ?? 1,
      },
      manufacturerListPriceCents: record.manufacturerlistprice
        ? toCents(record.manufacturerlistprice)
        : null,
      tags: record.tags ? record.tags.split(/[;|]/).map((t) => t.trim()).filter(Boolean) : [],
      notes: record.notes || undefined,
    };

    try {
      const existing = await PGComponent.findOne({ manufacturerId, partNumber });
      if (existing) {
        existing.set(update);
        await existing.save();
        result.updated++;
      } else {
        await PGComponent.create(update);
        result.created++;
      }
    } catch (err) {
      result.skipped.push({
        row: index + 2,
        reason: err instanceof Error ? err.message : "Could not save this row.",
        data: record,
      });
    }
  }

  return result;
}

export const ASSEMBLY_CSV_HEADERS = [
  "modelNumber", "name", "ageRange", "partNumber", "quantity",
  "laborHours", "footingCount", "concreteCuFt", "totalWeightLb", "safetyZoneSqFt",
];

/**
 * Import presets. One row per component; rows sharing a model number build one
 * assembly. The manufacturer summary columns need only appear on the first row
 * of each model.
 */
export async function importAssemblies(csvText: string, manufacturerId: string): Promise<ImportResult> {
  await connectDb();
  const records = toRecords(csvText);
  const result: ImportResult = { created: 0, updated: 0, skipped: [] };

  const grouped = new Map<string, Array<{ record: Record<string, string>; row: number }>>();
  for (const [index, record] of records.entries()) {
    const model = record.modelnumber || record.model;
    if (!model) {
      result.skipped.push({ row: index + 2, reason: "No model number on this row.", data: record });
      continue;
    }
    if (!grouped.has(model)) grouped.set(model, []);
    grouped.get(model)!.push({ record, row: index + 2 });
  }

  for (const [modelNumber, rows] of grouped) {
    const first = rows[0].record;
    const components: Array<{ componentId: Types.ObjectId; quantity: number }> = [];

    for (const { record, row } of rows) {
      const partNumber = record.partnumber || record.part;
      if (!partNumber) continue;
      const component = await PGComponent.findOne({ manufacturerId, partNumber });
      if (!component) {
        result.skipped.push({
          row,
          reason: `Part ${partNumber} is not in the component library yet. Import components first.`,
          data: record,
        });
        continue;
      }
      components.push({ componentId: component._id, quantity: num(record.quantity) ?? 1 });
    }

    const summaryRow = rows.find((r) => r.record.laborhours || r.record.footingcount)?.record ?? first;
    const update = {
      manufacturerId: new Types.ObjectId(manufacturerId),
      modelNumber,
      name: first.name || modelNumber,
      ageRange: first.agerange || undefined,
      components,
      manufacturerSummary: {
        laborHours: num(summaryRow.laborhours),
        footingCount: num(summaryRow.footingcount),
        concreteCuFt: num(summaryRow.concretecuft),
        totalWeightLb: num(summaryRow.totalweightlb),
        safetyZoneSqFt: num(summaryRow.safetyzonesqft),
      },
    };

    try {
      const existing = await PGAssembly.findOne({ manufacturerId, modelNumber });
      if (existing) {
        existing.set(update);
        await existing.save();
        result.updated++;
      } else {
        await PGAssembly.create(update);
        result.created++;
      }
    } catch (err) {
      result.skipped.push({
        row: rows[0].row,
        reason: err instanceof Error ? err.message : "Could not save this assembly.",
      });
    }
  }

  return result;
}

/** A blank file with the right headers, so nobody has to guess the format. */
export function csvTemplate(headers: string[]): string {
  return `${headers.join(",")}\n`;
}
