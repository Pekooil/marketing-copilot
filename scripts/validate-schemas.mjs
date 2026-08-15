import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFile } from "node:fs/promises";

const schemaPath = new URL("../docs/domain/canonical-artifacts.schema.json", import.meta.url);
const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  // The root is a oneOf union, so its object type is defined by each branch.
  strictTypes: false,
});
addFormats(ajv);
ajv.compile(schema);

if (!Array.isArray(schema.oneOf) || schema.oneOf.length === 0) {
  throw new Error("Canonical schema must expose at least one root artifact through oneOf.");
}

console.log(`Validated canonical JSON Schema ${schema.$id}.`);
