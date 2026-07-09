const state = {
  presetId: "quick",
  config: {
    setupMode: "skip",
    port: 3065,
    host: "127.0.0.1",
    dbPath: "",
    openBrowser: true,
  },
  running: false,
}

const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => document.querySelectorAll(sel)

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  })
  return res.json()
}

function setPanel(id) {
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.panel === id))
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${id}`))
}

function readConfigFromForm() {
  state.config.setupMode = $("#setupMode").dataset.value ?? "skip"
  state.config.port = Number($("#port").value) || 3065
  state.config.host = $("#host").value || "127.0.0.1"
  state.config.dbPath = $("#dbPath").value.trim()
  state.config.openBrowser = $("#openBrowser").checked
}

async function refreshPreview() {
  readConfigFromForm()
  const { command } = await api("/api/preview", {
    method: "POST",
    body: JSON.stringify(state.config),
  })
  $("#commandPreview").textContent = command
}

async function refreshStatus() {
  const s = await api("/api/status")
  $("#statusJlc").innerHTML = s.hasJlcsearch
    ? `<span class="ok">✓ jlcsearch: ${s.jlcsearchRoot}</span>`
    : `<span class="bad">✗ jlcsearch not found — clone the repo or set JLCSEARCH_ROOT</span>`
  $("#statusDb").innerHTML = s.hasDb
    ? `<span class="ok">✓ Database ready</span>`
    : `<span class="bad">✗ No db.sqlite3 found</span>`
  $("#dataDbPath").textContent = s.dbPath
}

function applyPreset(id) {
  state.presetId = id
  $$(".preset-row button").forEach((b) =>
    b.classList.toggle("selected", b.dataset.preset === id),
  )
  const presets = window.__manifest?.presets ?? []
  const preset = presets.find((p) => p.id === id)
  if (preset?.config) {
    Object.assign(state.config, preset.config)
    $("#setupMode").dataset.value = state.config.setupMode
    $$("#setupMode button").forEach((b) =>
      b.classList.toggle("active", b.dataset.value === state.config.setupMode),
    )
    $("#port").value = state.config.port
    $("#host").value = state.config.host
    $("#openBrowser").checked = state.config.openBrowser
  }
  refreshPreview()
}

function log(line) {
  const el = $("#console")
  const div = document.createElement("div")
  div.className = "line"
  div.textContent = line
  el.appendChild(div)
  el.scrollTop = el.scrollHeight
}

function setStep(id, status) {
  const li = document.querySelector(`#steps [data-step="${id}"]`)
  if (li) li.className = status
}

async function runJob() {
  if (state.running) return
  readConfigFromForm()
  state.running = true
  $("#btnRun").disabled = true
  $("#console").innerHTML = ""
  setPanel("run")
  ;["bun", "setup", "server"].forEach((id) => setStep(id, ""))

  const res = await fetch("/api/run", {
    method: "POST",
    body: JSON.stringify(state.config),
  })

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const parts = buf.split("\n\n")
    buf = parts.pop() ?? ""
    for (const part of parts) {
      const line = part.replace(/^data: /, "").trim()
      if (!line) continue
      try {
        const ev = JSON.parse(line)
        if (ev.type === "step") setStep(ev.id, ev.status)
        if (ev.type === "log") log(ev.line)
        if (ev.type === "done") {
          if (ev.error) {
            log(`Error: ${ev.error}`)
            alert(ev.error)
          } else if (ev.url) {
            log(`Server: ${ev.url}`)
            const embed = $("#embed")
            embed.src = ev.url
            embed.classList.remove("hidden")
            if (state.config.openBrowser) window.open(ev.url, "_blank")
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  state.running = false
  $("#btnRun").disabled = false
}

function bindUi() {
  $$(".nav button").forEach((b) =>
    b.addEventListener("click", () => setPanel(b.dataset.panel)),
  )

  $$(".preset-row button").forEach((b) =>
    b.addEventListener("click", () => applyPreset(b.dataset.preset)),
  )

  $$("#setupMode button").forEach((b) =>
    b.addEventListener("click", () => {
      $("#setupMode").dataset.value = b.dataset.value
      $$("#setupMode button").forEach((x) => x.classList.toggle("active", x === b))
      refreshPreview()
    }),
  )

  ;["#port", "#host", "#dbPath", "#openBrowser"].forEach((sel) => {
    $(sel)?.addEventListener("input", refreshPreview)
    $(sel)?.addEventListener("change", refreshPreview)
  })

  $("#btnRun").addEventListener("click", runJob)
  $("#btnStop").addEventListener("click", async () => {
    await api("/api/stop", { method: "POST" })
    log("Server stopped.")
  })
}

async function init() {
  const manifest = await api("/api/manifest")
  window.__manifest = manifest
  document.documentElement.style.setProperty("--accent", manifest.accent ?? "#1A7F72")
  $("#appTitle").textContent = manifest.displayName
  $("#upstreamLink").href = `https://github.com/${manifest.upstream.repo}`
  $("#upstreamLink").textContent = manifest.upstream.repo

  bindUi()
  applyPreset("quick")
  await refreshStatus()
}

init()