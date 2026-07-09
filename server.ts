import { readFileSync } from "node:fs"
import Path from "node:path"
import {
  buildCommandPreview,
  getStatus,
  runJob,
  stopServer,
  type RunConfig,
} from "./lib/runner"
import { getManifestPath, getRunwayRoot } from "./lib/paths"

const ROOT = getRunwayRoot()
const PORT = Number.parseInt(process.env.RUNWAY_PORT ?? "3080", 10)

const manifest = JSON.parse(readFileSync(getManifestPath(), "utf8"))

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
}

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === "/api/manifest") {
      return Response.json(manifest)
    }

    if (url.pathname === "/api/status") {
      return Response.json(getStatus())
    }

    if (url.pathname === "/api/preview" && req.method === "POST") {
      const body = (await req.json()) as RunConfig
      return Response.json({ command: buildCommandPreview(body) })
    }

    if (url.pathname === "/api/stop" && req.method === "POST") {
      stopServer()
      return Response.json({ ok: true })
    }

    if (url.pathname === "/api/run" && req.method === "POST") {
      const config = (await req.json()) as RunConfig
      const stream = new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder()
          const send = (data: object) => {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
          }
          try {
            for await (const event of runJob(config)) {
              send(event)
            }
          } catch (err) {
            send({
              type: "done",
              error: err instanceof Error ? err.message : String(err),
            })
          }
          controller.close()
        },
      })
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      })
    }

    if (url.pathname === "/" || url.pathname.startsWith("/ui/")) {
      const rel =
        url.pathname === "/"
          ? "/ui/index.html"
          : url.pathname.replace(/^\/ui/, "/ui")
      const filePath = Path.join(ROOT, rel)
      const file = Bun.file(filePath)
      if (!(await file.exists())) return new Response("Not found", { status: 404 })
      const ext = Path.extname(filePath)
      return new Response(file, {
        headers: {
          "Content-Type": mime[ext] ?? "application/octet-stream",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      })
    }

    return new Response("Not found", { status: 404 })
  },
})

console.log(`Runway UI: http://127.0.0.1:${PORT}/`)