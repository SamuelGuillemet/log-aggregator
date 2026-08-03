# Local Cluster Log Aggregator

Local-first log aggregation for clustered application logs. The current implementation is the first vertical slice: select an environment, country, and app side, resolve configured log shares, watch ACCOUNTING API log files, tail appended lines, parse normalized events, and stream them to a React dashboard over WebSocket.

## Stack

- pnpm workspaces
- Node.js native HTTP, TypeScript, ws, fs.watch
- React, Vite, shadcn/ui-style components, Zustand, TanStack Table, TanStack Virtual, TailwindCSS

## Install

```bash
pnpm install
```

## Develop

```bash
pnpm dev
```

- Backend: `http://127.0.0.1:3000`
- WebSocket: `ws://127.0.0.1:3000/ws`
- Frontend: `http://127.0.0.1:5173`

The app includes a local fixture source. In the dashboard, select:

- Environment: `LOCAL`
- Country: `SAMPLE`
- App: `Back`

Then click `Start stream`.

To simulate live logs, append a line to one of the fixture files:

```bash
printf '2026-07-29 10:05:00,000 INFO [worker-3] accounting.Demo - Live event requestId=REQ-LIVE-1\n' >> sample-logs/local-share-a/Java/apache-tomcat-back/logs/ACCOUNTING-API-serveur.2026-07-29-0.log
```

## Validate

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

Focused backend tests can be run with:

```bash
pnpm --filter @log-aggregator/server test
```

## Make It Available

The practical release shape is split in two pieces:

- GitHub Pages hosts the static frontend.
- A downloadable local runner starts the Node backend on the user's machine, watches local/network log shares, and serves the same frontend at `http://127.0.0.1:3000`.

Build the local runner with:

```bash
pnpm package
```

This creates `release/log-aggregator-local.tar.gz`. When `zip` is installed, it also creates `release/log-aggregator-local.zip` for Windows-friendly downloads. Extract the archive, then run:

```bash
./start.sh
```

On Windows, run `start.cmd` instead. Node.js 22 or newer is required.

For GitHub Pages, enable Pages in the repository settings with `GitHub Actions` as the source. The workflow in [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) deploys the client on every push to `main`.

To publish a downloadable runner on GitHub Releases, push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow in [.github/workflows/release.yml](.github/workflows/release.yml) attaches `log-aggregator-local.tar.gz` and `log-aggregator-local.zip` to the release.

## Configuration

Source configuration lives in [server/config/environment-matrix.json](server/config/environment-matrix.json). You can point the backend to another matrix file with `LOG_AGGREGATOR_MATRIX_FILE`.

Each selected environment/country entry expands every share into the selected app-side directory:

- `Java/apache-tomcat-back/logs`
- `Java/apache-tomcat-front/logs`

The current matrix contains the requirement examples plus a `LOCAL/SAMPLE` fixture entry for development on this machine. Relative shares in the JSON file are resolved from the JSON file directory.

Parser configuration lives in [server/config/parser.json](server/config/parser.json). You can point the backend to another parser file with `LOG_AGGREGATOR_PARSER_FILE`. Parser config defines the line pattern and captured groups; supported log file names are fixed in the backend.

## Supported Log Files

The watcher processes selected project/date files with these backend-supported names:

- `APPLI-serveur.YYYY-MM-DD-N.log`
- `APPLI-fwk.YYYY-MM-DD-N.log`

The default parser accepts lines shaped like:

```text
2026-07-29 10:15:30,123 INFO [main] accounting.Service - Message requestId=REQ-42 sessionId=SID-7 transactionId=TX-9
```

Lines without timestamps are appended to the previous event from the same file, which keeps multiline stack traces attached to the log entry that produced them.

## Deferred

- full correlation engine
- backend search index
- runtime parser/plugin loading
- persisted settings UI
- Windows UNC validation on the target machine
