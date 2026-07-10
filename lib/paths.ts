import Path from "node:path"
import { existsSync } from "node:fs"

const RUNWAY_ROOT = Path.resolve(import.meta.dir, "..")

export const getRunwayRoot = () => RUNWAY_ROOT

export const getManifestPath = () => Path.join(RUNWAY_ROOT, "runway.manifest.json")

const isHealthyInstall = (root: string): boolean =>
  existsSync(Path.join(root, "package.json")) &&
  existsSync(Path.join(root, "node_modules/react/jsx-dev-runtime.js"))

const hasPackage = (root: string): boolean =>
  existsSync(Path.join(root, "package.json"))

const dedupe = (paths: string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of paths) {
    const key = Path.resolve(p).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(Path.resolve(p))
  }
  return out
}

/** Candidate jlcsearch roots in priority order. */
export const getJlcsearchCandidates = (): string[] => {
  const candidates: string[] = []

  const fromEnv = process.env.JLCSEARCH_ROOT?.trim()
  if (fromEnv) candidates.push(fromEnv)

  candidates.push(
    Path.resolve(RUNWAY_ROOT, "../jlcsearch-pilot"),
    Path.resolve(RUNWAY_ROOT, "../jlcsearch"),
  )

  if (process.platform === "win32") {
    // Optional local dev paths — only when present (never required for other machines)
    for (const p of ["C:\\dev\\jlcsearch-pilot", "C:\\jlcsearch-test"]) {
      if (existsSync(p)) candidates.push(p)
    }
  }

  return dedupe(candidates)
}

/** Resolved jlcsearch workspace (env, sibling clone, or optional local path). */
export const getJlcsearchRoot = (): string => {
  const candidates = getJlcsearchCandidates()

  for (const root of candidates) {
    if (isHealthyInstall(root)) return root
  }

  for (const root of candidates) {
    if (hasPackage(root)) return root
  }

  return Path.resolve(RUNWAY_ROOT, "../jlcsearch-pilot")
}

export const getDefaultDbPath = (jlcsearchRoot: string) =>
  Path.join(jlcsearchRoot, "db.sqlite3")