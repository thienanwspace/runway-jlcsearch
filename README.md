# JLC Search — Runway

One-click visual wrapper for [tscircuit/jlcsearch](https://github.com/tscircuit/jlcsearch). Run the JLCPCB parts search engine locally on Windows without WSL.

**Not an official tscircuit product.** Independent UI by [@thienanwspace](https://github.com/thienanwspace).

## Requirements

- [Bun](https://bun.com) >= 1.2.0
- A clone of [jlcsearch](https://github.com/tscircuit/jlcsearch) with dependencies installed

## Quick start

```powershell
# 1. Clone jlcsearch outside OneDrive (recommended)
git clone --depth 1 https://github.com/tscircuit/jlcsearch.git C:\dev\jlcsearch-pilot
cd C:\dev\jlcsearch-pilot
bun install --ignore-scripts
bun add zod format-si-unit

# 2. Run Runway
cd path\to\runway-jlcsearch
.\scripts\runway-start.ps1
```

Open http://127.0.0.1:3080/ — click **Run**.

## Configuration

| Variable | Description |
|----------|-------------|
| `JLCSEARCH_ROOT` | Path to your jlcsearch clone |
| `JLCSEARCH_DB_PATH` | Path to `db.sqlite3` (optional) |
| `RUNWAY_PORT` | Runway UI port (default `3080`) |

**Tip:** Do not install `node_modules` inside OneDrive — Files On-Demand leaves empty placeholders.

## Presets

- **Quick start** — skip DB build, start server
- **Full database build** — download jlcparts cache and build DB (~2GB)
- **Server only** — assumes `db.sqlite3` already exists

## Ports

| Service | Default |
|---------|---------|
| Runway UI | 3080 |
| jlcsearch | 3065 |

## License

MIT (wrapper). Upstream jlcsearch is MIT by tscircuit.