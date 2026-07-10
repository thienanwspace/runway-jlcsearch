/**
 * Capture README screenshots. Requires jlcsearch on :3065 for the run view.
 * Usage: bun scripts/capture-screenshots.ts
 */
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import Path from "node:path"
import { chromium } from "playwright"

const ROOT = Path.resolve(import.meta.dir, "..")
const OUT = Path.join(ROOT, "docs", "screenshots")
const RUNWAY = "http://127.0.0.1:3080"
const JLC = "http://127.0.0.1:3065"

const waitFor = async (url: string, ms = 30000): Promise<void> => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* retry */
    }
    await Bun.sleep(500)
  }
  throw new Error(`Timeout waiting for ${url}`)
}

if (!existsSync(OUT)) await mkdir(OUT, { recursive: true })

const runway = Bun.spawn(["bun", "run", "server.ts"], {
  cwd: ROOT,
  stdout: "pipe",
  stderr: "pipe",
  env: { ...process.env, RUNWAY_PORT: "3080" },
})

try {
  await waitFor(`${RUNWAY}/`)
  const localChrome = Path.join(
    process.env.LOCALAPPDATA ?? "",
    "Google/Chrome/Application/chrome.exe",
  )
  const chrome = process.env.CHROME_PATH ?? localChrome
  const browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    timeout: 120_000,
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  await page.goto(`${RUNWAY}/`, { waitUntil: "networkidle" })
  await page.waitForSelector("#appTitle")
  await page.screenshot({ path: Path.join(OUT, "start.png") })

  await page.click('button[data-panel="run"]')
  await page.waitForTimeout(300)
  await page.screenshot({ path: Path.join(OUT, "progress.png") })

  try {
    await waitFor(`${JLC}/`, 5000)
    await page.evaluate((url) => {
      const embed = document.querySelector<HTMLIFrameElement>("#embed")
      if (embed) {
        embed.src = url
        embed.classList.remove("hidden")
      }
    }, `${JLC}/`)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: Path.join(OUT, "run-embed.png") })
  } catch {
    console.log("jlcsearch not on :3065 — skipped run-embed.png")
  }

  await browser.close()
  console.log(`Screenshots saved to ${OUT}`)
} finally {
  runway.kill()
  await runway.exited
}