import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const releaseDirectory = path.join(repositoryRoot, "release");
const packageName = "log-aggregator-local";
const stagingDirectory = path.join(releaseDirectory, packageName);
const artifactPath = path.join(releaseDirectory, `${packageName}.zip`);

run("pnpm", ["run", "build"], repositoryRoot);

await rm(stagingDirectory, { force: true, recursive: true });
await rm(artifactPath, { force: true });
await mkdir(stagingDirectory, { recursive: true });

await cp(
  path.join(repositoryRoot, "server", "dist"),
  path.join(stagingDirectory, "server"),
  { recursive: true },
);

await writePackageJson();
await writeLauncherScripts();

run("npm", ["install", "--omit=dev", "--ignore-scripts"], stagingDirectory);

if (hasCommand("zip")) {
  run("zip", ["-qr", artifactPath, packageName], releaseDirectory);
}

if (existsSync(artifactPath)) {
  console.info(`Created ${path.relative(repositoryRoot, artifactPath)}`);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function hasCommand(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

async function writePackageJson() {
  const rootPackage = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const serverPackage = JSON.parse(
    await readFile(path.join(repositoryRoot, "server", "package.json"), "utf8"),
  );
  const { "@log-aggregator/shared": _, ...dependencies } =
    serverPackage.dependencies;

  await writeFile(
    path.join(stagingDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: packageName,
        version: rootPackage.version,
        private: true,
        type: "module",
        scripts: {
          start: "node server/index.js",
        },
        dependencies,
        engines: {
          node: ">=22",
        },
      },
      null,
      2,
    )}\n`,
  );
}

async function writeLauncherScripts() {
  const commandScript = path.join(stagingDirectory, "start.cmd");

  await writeFile(
    commandScript,
    ["@echo off", "cd /d %~dp0", "node server/index.js", ""].join("\r\n"),
  );
}

if (!existsSync(artifactPath)) {
  process.exit(1);
}
