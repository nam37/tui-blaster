import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const candidates =
  process.platform === "win32"
    ? [
        join(root, "node_modules", "@oven", "bun-windows-x64", "bin", "bun.exe"),
        join(root, "node_modules", "bun", "bin", "bun.exe"),
        "bun.cmd",
        "bun",
      ]
    : [join(root, "node_modules", "bun", "bin", "bun"), "bun"]

const bun = candidates.find((candidate) => candidate === "bun" || candidate === "bun.cmd" || existsSync(candidate))
if (!bun) {
  console.error("Unable to find Bun. Run npm install first.")
  process.exit(1)
}

const result = spawnSync(bun, process.argv.slice(2), { stdio: "inherit", cwd: root, shell: false })

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 0)
