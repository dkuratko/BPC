import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { parseCsv, toRecords } from "../src/services/csvImportService";

describe("csv parsing", () => {
  test("quoted fields keep their commas", () => {
    const rows = parseCsv('a,b\n"Deck, square",165\n');
    assert.deepEqual(rows[1], ["Deck, square", "165"]);
  });

  test("doubled quotes are an escaped quote", () => {
    const rows = parseCsv('a\n"5"" post"\n');
    assert.deepEqual(rows[1], ['5" post']);
  });

  test("a quoted field can span lines", () => {
    const rows = parseCsv('a,b\n"line one\nline two",2\n');
    assert.equal(rows.length, 2);
    assert.equal(rows[1][0], "line one\nline two");
  });

  test("headers are matched however they were typed or spaced", () => {
    const records = toRecords("Part Number,Base_Labor-Hours\nPB-1,3.5\n");
    assert.equal(records[0].partnumber, "PB-1");
    assert.equal(records[0].baselaborhours, "3.5");
  });

  test("a spreadsheet BOM and CRLF line endings do not break the header row", () => {
    const records = toRecords("﻿partNumber,name\r\nPB-1,Deck\r\n");
    assert.equal(records[0].partnumber, "PB-1");
    assert.equal(records[0].name, "Deck");
  });

  test("blank lines are skipped", () => {
    assert.equal(parseCsv("a,b\n\n1,2\n\n").length, 2);
  });
});
