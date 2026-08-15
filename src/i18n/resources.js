import common from "./catalogs/common";
import vendor from "./catalogs/vendor";
import consoleCatalog from "./catalogs/console";
import safety from "./catalogs/safety";
import guidance from "./catalogs/guidance";
import errors from "./catalogs/errors";
import proof from "./catalogs/proof";
import roadmap from "./catalogs/roadmap";
import { LOCALE_ORDER } from "./catalogs/helpers";

export const NAMESPACES = ["common", "vendor", "console", "safety", "guidance", "errors", "proof", "roadmap"];

const catalogs = {
  common,
  vendor,
  console: consoleCatalog,
  safety,
  guidance,
  errors,
  proof,
  roadmap,
};

export const resources = Object.fromEntries(LOCALE_ORDER.map((locale) => [
  locale,
  Object.fromEntries(NAMESPACES.map((namespace) => [
    namespace,
    Object.fromEntries(Object.entries(catalogs[namespace]).map(([key, values]) => [key, values[locale]])),
  ])),
]));

export function catalogKeys(namespace) {
  return Object.keys(catalogs[namespace] || {}).sort();
}
