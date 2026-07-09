import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import Path from "node:path"
import { getDefaultDbPath, getJlcsearchRoot } from "./paths"

export type RunConfig = {
  setupMode: "skip" | "full"
  port: number
  host: string
  dbPath: string
  openBrowser: boolean
}

export type JobEvent =
  | { type: "step"; id: string; label: string; status: "running" | "done" | "error" }
  | { type: "log"; line: string }
  | { type: "done"; url?: string; error?: string }

const isWin = process.platform === "win32"

const bunPath = () => {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ""
  const candidates = [
    process.env.BUN_INSTALL,
    home ? Path.join(home, ".bun", "bin") : "",
  ].filter(Boolean) as string[]
  for (const dir of candidates) {
    const exe = Path.join(dir, isWin ? "bun.exe" : "bun")
    if (existsSync(exe)) return exe
  }
  return "bun"
}

const spawnEnv = (extra: Record<string, string> = {}) => {
  const home = process.env.USERPROFILE ?? ""
  const bunBin = home ? Path.join(home, ".bun", "bin") : ""
  const pathKey = isWin ? "Path" : "PATH"
  const pathVal = bunBin
    ? `${bunBin}${isWin ? ";" : ":"}${process.env[pathKey] ?? ""}`
    : (process.env[pathKey] ?? "")
  return { ...process.env, [pathKey]: pathVal, ...extra }
}

const runCommand = (
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: Record<string, string>; onLine?: (line: string) => void },
): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: spawnEnv(opts.env),
      shell: isWin,
      stdio: ["ignore", "pipe", "pipe"],
    })

    const handle = (chunk: Buffer) => {
      const text = chunk.toString()
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) opts.onLine?.(line)
      }
    }

    child.stdout?.on("data", handle)
    child.stderr?.on("data", handle)
    child.on("error", reject)
    child.on("close", (code) => resolve(code ?? 1))
  })

const checkBun = async (onLine: (line: string) => void): Promise<void> => {
  const code = await runCommand("bun", ["--version"], {
    cwd: process.cwd(),
    onLine,
  })
  if (code !== 0) throw new Error("Bun is not installed. Install from https://bun.com")
}

const extractCacheWin = async (
  jlcsearchRoot: string,
  onLine: (line: string) => void,
): Promise<void> => {
  const script = Path.join(import.meta.dir, "../scripts/runway-extract-cache.ts")
  const code = await runCommand("bun", [script], { cwd: jlcsearchRoot, onLine })
  if (code !== 0) throw new Error("Cache extraction failed")
}

const runFullSetup = async (
  jlcsearchRoot: string,
  onLine: (line: string) => void,
  onStep?: (label: string) => void,
): Promise<void> => {
  const steps: Array<{ label: string; run: () => Promise<void> }> = [
    {
      label: "Install dependencies (bun i)",
      run: async () => {
        const c = await runCommand("bun", ["i"], { cwd: jlcsearchRoot, onLine })
        if (c !== 0) throw new Error("bun i failed")
      },
    },
    {
      label: "Download 7zip",
      run: async () => {
        const c = await runCommand("bun", ["run", "setup:7z"], {
          cwd: jlcsearchRoot,
          onLine,
        })
        if (c !== 0) throw new Error("setup:7z failed (Windows may need a patch — see log)")
      },
    },
    {
      label: "Download jlcparts cache",
      run: async () => {
        const c = await runCommand("bun", ["scripts/download-cache-fragments.ts"], {
          cwd: jlcsearchRoot,
          onLine,
        })
        if (c !== 0) throw new Error("Cache download failed")
      },
    },
    {
      label: "Extract database",
      run: async () => {
        if (isWin) {
          await extractCacheWin(jlcsearchRoot, onLine)
        } else {
          const c = await runCommand("bun", ["run", "setup:extract-db"], {
            cwd: jlcsearchRoot,
            onLine,
          })
          if (c !== 0) throw new Error("Extraction failed")
          const c2 = await runCommand("bun", ["run", "setup:replace-db-file"], {
            cwd: jlcsearchRoot,
            onLine,
          })
          if (c2 !== 0) throw new Error("Database file replacement failed")
        }
      },
    },
    {
      label: "Optimize database",
      run: async () => {
        const c = await runCommand("bun", ["run", "scripts/setup-db-optimizations.ts"], {
          cwd: jlcsearchRoot,
          onLine,
        })
        if (c !== 0) throw new Error("Database optimization failed")
      },
    },
    {
      label: "Create derived tables",
      run: async () => {
        const c = await runCommand("bun", ["run", "scripts/setup-derived-tables.ts"], {
          cwd: jlcsearchRoot,
          onLine,
        })
        if (c !== 0) throw new Error("Derived tables setup failed")
      },
    },
  ]

  for (const step of steps) {
    onStep?.(step.label)
    onLine(`→ ${step.label}`)
    await step.run()
  }
}

let serverProcess: ReturnType<typeof spawn> | null = null

export const stopServer = (): void => {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
}

export const buildCommandPreview = (config: RunConfig): string => {
  const root = getJlcsearchRoot()
  const db = config.dbPath || getDefaultDbPath(root)
  return `cd "${root}" && PORT=${config.port} HOST=${config.host} JLCSEARCH_DB_PATH="${db}" bun run start:origin`
}

export async function* runJob(config: RunConfig): AsyncGenerator<JobEvent> {
  const jlcsearchRoot = getJlcsearchRoot()
  const dbPath = config.dbPath || getDefaultDbPath(jlcsearchRoot)

  if (!existsSync(Path.join(jlcsearchRoot, "package.json"))) {
    yield {
      type: "done",
      error: `jlcsearch not found at ${jlcsearchRoot}. Clone the repo or set JLCSEARCH_ROOT.`,
    }
    return
  }

  try {
    yield { type: "step", id: "bun", label: "Check Bun", status: "running" }
    await checkBun(() => {})
    yield { type: "step", id: "bun", label: "Check Bun", status: "done" }

    const bun = bunPath()
    for (const pkg of ["zod", "format-si-unit"]) {
      const pkgDir = Path.join(jlcsearchRoot, "node_modules", pkg)
      if (!existsSync(Path.join(pkgDir, "package.json"))) {
        yield { type: "log", line: `Installing ${pkg}...` }
        const c = await runCommand(bun, ["add", pkg], { cwd: jlcsearchRoot })
        if (c !== 0) throw new Error(`Failed to install ${pkg}`)
      }
    }

    if (config.setupMode === "full") {
      yield { type: "step", id: "setup", label: "Build database", status: "running" }
      const logQueue: string[] = []
      await runFullSetup(jlcsearchRoot, (line) => {
        logQueue.push(line)
      })
      for (const line of logQueue) yield { type: "log", line }
      yield { type: "step", id: "setup", label: "Build database", status: "done" }
    } else if (!existsSync(dbPath)) {
      yield {
        type: "log",
        line: `⚠ No database at ${dbPath}. Use the "Full database build" preset or set JLCSEARCH_DB_PATH.`,
      }
    }

    yield { type: "step", id: "server", label: "Start server", status: "running" }

    const env: Record<string, string> = {
      PORT: String(config.port),
      HOST: config.host,
      JLCSEARCH_DB_PATH: dbPath,
    }

    const serverLogs: string[] = []
    serverProcess = spawn("bun", ["run", "start:origin"], {
      cwd: jlcsearchRoot,
      env: spawnEnv(env),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    })

    const url = `http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${config.port}/`
    let ready = false

    const waitReady = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!ready) resolve()
      }, 15000)

      const onData = (chunk: Buffer) => {
        const text = chunk.toString()
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) serverLogs.push(line)
        }
        if (text.includes("Starting server") || text.includes(String(config.port))) {
          ready = true
          clearTimeout(timeout)
          resolve()
        }
      }

      serverProcess?.stdout?.on("data", onData)
      serverProcess?.stderr?.on("data", onData)
      serverProcess?.on("error", reject)
      serverProcess?.on("close", (code) => {
        if (!ready && code !== 0) {
          const tail = serverLogs.slice(-5).join(" | ")
          reject(new Error(`Server exited early (code ${code})${tail ? `: ${tail}` : ""}`))
        }
      })
    })

    await waitReady
    yield { type: "step", id: "server", label: "Start server", status: "done" }
    yield { type: "done", url }
  } catch (err) {
    yield {
      type: "done",
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export const getStatus = () => {
  const jlcsearchRoot = getJlcsearchRoot()
  const dbPath = getDefaultDbPath(jlcsearchRoot)
  let hasDb = false
  if (existsSync(dbPath)) {
    try {
      hasDb = (Bun.file(dbPath).size ?? 0) > 1024
    } catch {
      hasDb = false
    }
  }
  return {
    jlcsearchRoot,
    hasJlcsearch: existsSync(Path.join(jlcsearchRoot, "package.json")),
    hasDb,
    dbPath,
    serverRunning: serverProcess != null && !serverProcess.killed,
  }
}