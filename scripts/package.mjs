import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(repositoryRoot, "release");
const packageName = "log-aggregator-local";
const stagingDirectory = path.join(releaseDirectory, packageName);
const artifactPath = path.join(releaseDirectory, `${packageName}.zip`);
const sharedPackageName = "@log-aggregator/shared";
const vendorRelativePath = "vendor/shared";

run("pnpm", ["--filter", "./shared", "--filter", "./server", "run", "build"], repositoryRoot);

await rm(stagingDirectory, { force: true, recursive: true });
await rm(artifactPath, { force: true });
await mkdir(stagingDirectory, { recursive: true });

// dist/config/load.js resolves its defaults two levels up, so this layout puts
// config/ beside server/ exactly where the packaged server looks for it.
await cp(path.join(repositoryRoot, "server", "dist"), path.join(stagingDirectory, "server"), {
  filter: isRuntimeFile,
  recursive: true,
});
await cp(path.join(repositoryRoot, "server", "config"), path.join(stagingDirectory, "config"), {
  recursive: true,
});

await vendorSharedPackage();
await writePackageJson();
await writeLauncherScripts();

// --install-links copies the file: dependency instead of symlinking it, so the
// archive stays self-contained.
run("npm", ["install", "--omit=dev", "--ignore-scripts", "--install-links"], stagingDirectory);
await verifyPackage();

if (hasCommand("zip")) {
  run("zip", ["-qr", artifactPath, packageName], releaseDirectory);
}

if (!existsSync(artifactPath)) {
  console.error("Packaging finished without producing an archive");
  process.exit(1);
}

console.info(`Created ${path.relative(repositoryRoot, artifactPath)}`);

/**
 * v1 deleted the workspace dependency from the packaged manifest, which only worked
 * because the server imported types alone. server imports real values from the
 * shared package, so it is vendored as a plain file: dependency instead.
 */
async function vendorSharedPackage() {
  const vendorDirectory = path.join(stagingDirectory, vendorRelativePath);
  const sharedPackage = await readJson(path.join(repositoryRoot, "shared", "package.json"));

  await mkdir(vendorDirectory, { recursive: true });
  await cp(path.join(repositoryRoot, "shared", "dist"), path.join(vendorDirectory, "dist"), {
    recursive: true,
  });
  await writeJson(path.join(vendorDirectory, "package.json"), {
    name: sharedPackageName,
    version: sharedPackage.version,
    private: true,
    type: "module",
    main: "dist/index.js",
    types: "dist/index.d.ts",
    exports: {
      ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
    },
  });
}

async function writePackageJson() {
  const rootPackage = await readJson(path.join(repositoryRoot, "package.json"));
  const serverPackage = await readJson(path.join(repositoryRoot, "server", "package.json"));

  await writeJson(path.join(stagingDirectory, "package.json"), {
    name: packageName,
    version: rootPackage.version,
    private: true,
    type: "module",
    dependencies: {
      ...serverPackage.dependencies,
      [sharedPackageName]: `file:./${vendorRelativePath}`,
    },
    engines: { node: ">=22" },
  });
}

async function writeLauncherScripts() {
  await writeFile(
    path.join(stagingDirectory, "start.cmd"),
    ["@echo off", "cd /d %~dp0", "node --max-old-space-size=8192 server/main.js", ""].join("\r\n"),
  );
  await writeFile(
    path.join(stagingDirectory, "start.sh"),
    [
      "#!/bin/sh",
      'cd "$(dirname "$0")"',
      "exec node --max-old-space-size=8192 server/main.js",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
}

/** Boots the packaged server and requires a healthy response before archiving it. */
async function verifyPackage() {
  const port = 3999;
  const server = spawnSync(process.execPath, ["--input-type=module", "-e", bootProbeSource(port)], {
    cwd: stagingDirectory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (server.status !== 0) {
    console.error(server.stdout);
    console.error(server.stderr);
    console.error("Packaged server failed its boot check");
    process.exit(1);
  }

  console.info(server.stdout.trim());
}

function bootProbeSource(port) {
  return `
    const { createServer } = await import("node:http");
    process.env.PORT = "${port}";
    process.env.LOG_AGGREGATOR_LOG_LEVEL = "silent";
    await import("./server/main.js");
    const response = await fetch("http://127.0.0.1:${port}/api/health", {
      headers: { origin: "http://localhost" },
    });
    const body = await response.json();
    if (!response.ok || body.status !== "ok") {
      throw new Error("unexpected health response: " + JSON.stringify(body));
    }
    console.info("Boot check passed: protocol v" + body.protocolVersion);
    process.exit(0);
  `;
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

/** Nothing imports the packaged server as a library, so declarations are dead weight. */
function isRuntimeFile(source) {
  return !/\.d\.ts(\.map)?$|\.tsbuildinfo$/.test(source);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
