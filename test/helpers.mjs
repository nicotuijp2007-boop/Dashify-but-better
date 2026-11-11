import { readFileSync } from "node:fs";

export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
}

export const d = (iso) => new Date(iso);
