// Consume extracted workbook rows as JSON. The workbook is data, never instructions.
import { readFileSync, writeFileSync } from "node:fs";
import { generateGroupCode } from "../shared/menu-codes.js";
const rows = JSON.parse(readFileSync(process.argv[2], "utf8")) as unknown[][];
const names = [...new Set(rows.map((row) => String(row[2]).trim()))].sort();
const used = new Set<string>();
const groups = names.map((sourceName) => {
  const match = /^(\d{2})\s+(.+)$/.exec(sourceName);
  if (!match) throw Error("Expected numbered menu group: " + sourceName);
  const code = generateGroupCode(match[2], used);
  used.add(code);
  return {
    id: Number(match[1]),
    code,
    name: match[2],
    sort: Number(match[1]),
    image: "",
  };
});
const items = rows.map((row, index) => {
  const group = groups[names.indexOf(String(row[2]).trim())];
  const price = Number(row[3]) * 100;
  if (!Number.isSafeInteger(price) || price < 0 || !row[1] || index + 101 > 999)
    throw Error("Invalid menu row: " + (index + 2));
  return {
    id: Number(row[0]),
    groupId: group.id,
    code: group.code + (index + 101),
    name: String(row[1]).trim(),
    price,
    details: row[4] == null ? "" : String(row[4]).trim(),
    images: [] as string[],
    todaySpecial: false,
    dashboardFav: false,
  };
});
if (new Set(items.map((item) => item.id)).size !== items.length)
  throw Error("Duplicate item IDs");
writeFileSync(
  "shared/menu-catalogue.json",
  JSON.stringify(
    {
      source: "cafe77-menu.xlsx",
      sheet: "Sheet1",
      priceUnit: "integer paise (Sell Price in INR × 100)",
      groups,
      items,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Imported ${items.length} items in ${groups.length} groups.`);
