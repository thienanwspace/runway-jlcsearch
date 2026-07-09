import Path from "node:path"
import { existsSync } from "node:fs"

const RUNWAY_ROOT = Path.resolve(import.meta.dir, "..")

export const getRunwayRoot = () => RUNWAY_ROOT

export const getManifestPath = () => Path.join(RUNWAY_ROOT, "runway.manifest.json")

const isHealthyInstall = (root: string): boolean =>
  existsSync(Path.join(root, "package.json")) &&
  existsSync(Path.join(root, "node_modules/react/jsx-dev-runtime.js"))

/** Resolved jlcsearch workspace (env, local dev path, or sibling clone). */
export const getJlcsearchRoot = (): string => {
  const candidates: string[] = []

  const fromEnv = process.env.JLCSEARCH_ROOT?.trim()
  if (fromEnv) candidates.push(Path.resolve(fromEnv))

  // Prefer non-OneDrive install (OneDrive Files On-Demand leaves empty node_modules)
  candidates.push("C:\\dev\\jlcsearch-pilot")
  candidates.push(Path.resolve(RUNWAY_ROOT, "../jlcsearch-pilot"))
  candidates.push(Path.resolve(RUNWAY_ROOT, "../jlcsearch"))

  for (const root of candidates) {
    if (isHealthyInstall(root)) return root
  }

  for (const root of candidates) {
    if (existsSync(Path.join(root, "package.json"))) return root
  }

  return Path.resolve(RUNWAY_ROOT, "../jlcsearch-pilot")
}

export const getDefaultDbPath = (jlcsearchRoot: string) =>
  Path.join(jlcsearchRoot, "db.sqlite3")