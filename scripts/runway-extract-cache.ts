/**
 * Cross-platform replacement for setup:extract-db + setup:replace-db-file on Windows.
 */
import { existsSync } from "node:fs"
import { rename, unlink } from "node:fs/promises"
import Path from "node:path"
import { spawn } from "node:child_process"

const root = process.cwd()
const cacheZip = Path.join(root, ".buildtmp", "cache.zip")
const bin7z = Path.join(root, ".bin", process.platform === "win32" ? "7z.exe" : "7zz")
const outDb = Path.join(root, "cache.sqlite3")
const targetDb = Path.join(root, "db.sqlite3")

const run = (cmd: string, args: string[]) =>
  new Promise<number>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, shell: true, stdio: "inherit" })
    child.on("error", reject)
    child.on("close", (code) => resolve(code ?? 1))
  })

if (!existsSync(cacheZip)) {
  console.error(`Not found: ${cacheZip}. Run download-cache-fragments first.`)
  process.exit(1)
}

if (!existsSync(bin7z)) {
  console.error(`7zip not found at ${bin7z}. setup:7z needs a Windows patch.`)
  process.exit(1)
}

console.log("Extracting cache.zip...")
const code = await run(bin7z, ["x", cacheZip, `-o${root}`, "-y"])
if (code !== 0) process.exit(code)

if (!existsSync(outDb)) {
  console.error("Extraction finished but cache.sqlite3 was not found")
  process.exit(1)
}

if (existsSync(targetDb)) await unlink(targetDb)
await rename(outDb, targetDb)
console.log(`Created ${targetDb}`)