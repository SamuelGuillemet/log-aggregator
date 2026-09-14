import { type FileHandle, open, stat } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import { logger } from "../util/logger.js";

// A high-latency mount (a Windows UNC share) pays a round trip per read call
// regardless of size, so priming a large backlog is dominated by the number of
// reads, not their total size. 64 KiB meant ~7,500 reads per 500 MB backlog.
const CHUNK_SIZE = 1_024 * 1_024;
/** A file with no newline at all must not grow an unbounded carry buffer. */
const MAX_CARRY_LENGTH = 4 * 1_024 * 1_024;
/** Above this, a single poll() is logged with a phase breakdown to find the slow part. */
const SLOW_POLL_MS = 200;

export interface PollResult {
  lines: number;
  /** The file was replaced or truncated, so previously emitted lines are stale. */
  restarted: boolean;
}

export interface FileTailerOptions {
  /** A fresh file bigger than this is tailed from the end instead of byte 0. */
  maxBackfillBytes?: number;
}

/**
 * Incremental, restart-safe reader for a single append-only log file.
 *
 * Fixes the four v1 tail defects at once:
 *  - reads fixed chunks instead of `Buffer.alloc(size - position)`;
 *  - advances the position by the *actual* `bytesRead`, never by `stat.size`;
 *  - decodes through `StringDecoder`, so multi-byte codepoints survive chunk splits;
 *  - keeps an explicit carry buffer, so a line without its newline is never parsed
 *    as if it were complete.
 */
export class FileTailer {
  private handle: FileHandle | undefined;
  private position = 0;
  private inode: number | undefined;
  private carry = "";
  private decoder = new StringDecoder("utf8");
  private readonly chunk = Buffer.allocUnsafe(CHUNK_SIZE);
  /** `close()` can land while a poll's read loop is still awaiting a chunk. */
  private closed = false;
  /** Set right after a backfill seek, until the partial line at the seek point is dropped. */
  private discardingSeekFragment = false;

  constructor(
    readonly filePath: string,
    private readonly onLine: (line: string) => void,
    private readonly options: FileTailerOptions = {},
  ) {}

  /** Reads everything appended since the last call. */
  async poll(): Promise<PollResult> {
    const pollStartedAt = Date.now();
    const statStartedAt = pollStartedAt;
    const stats = await stat(this.filePath);
    const statMs = Date.now() - statStartedAt;

    if (!stats.isFile()) {
      return { lines: 0, restarted: false };
    }

    // A changed inode means the file was replaced; a shrunken size means it was
    // truncated in place. Either way the old position is meaningless, and so are the
    // lines already emitted from it, so the caller is told to start over.
    const rotated =
      this.inode !== undefined &&
      ((stats.ino > 0 && stats.ino !== this.inode) || stats.size < this.position);

    if (rotated) {
      await this.reset();
      this.inode = stats.ino;

      return { lines: 0, restarted: true };
    }

    this.inode = stats.ino;

    if (this.position === 0) {
      const maxBackfillBytes = this.options.maxBackfillBytes;

      if (maxBackfillBytes !== undefined && stats.size > maxBackfillBytes) {
        const skippedBytes = stats.size - maxBackfillBytes;

        this.position = skippedBytes;
        this.discardingSeekFragment = true;
        logger.info(
          `skipping backfill file=${this.filePath} skippedBytes=${skippedBytes} keepBytes=${maxBackfillBytes}`,
        );
      }
    }

    if (stats.size <= this.position) {
      return { lines: 0, restarted: false };
    }

    let openMs = 0;

    if (!this.handle) {
      const openStartedAt = Date.now();
      const opened = await open(this.filePath, "r");
      openMs = Date.now() - openStartedAt;

      // close() landed while `open` was in flight: do not resurrect a torn-down tailer.
      if (this.closed) {
        await opened.close();

        return { lines: 0, restarted: false };
      }

      this.handle = opened;
    }

    const handle = this.handle;
    let lines = 0;
    let chunks = 0;
    let bytesReadTotal = 0;
    let readMs = 0;

    while (this.position < stats.size) {
      // close() can land between two awaited reads of the same poll; stop rather
      // than reading through a handle that was just closed out from under us.
      if (this.handle !== handle) {
        break;
      }

      const wanted = Math.min(CHUNK_SIZE, stats.size - this.position);
      const readStartedAt = Date.now();
      const { bytesRead } = await handle.read(this.chunk, 0, wanted, this.position);
      readMs += Date.now() - readStartedAt;

      if (bytesRead <= 0) {
        break;
      }

      chunks += 1;
      bytesReadTotal += bytesRead;
      this.position += bytesRead;

      let text = this.decoder.write(this.chunk.subarray(0, bytesRead));

      if (this.discardingSeekFragment) {
        const newlineIndex = text.indexOf("\n");

        if (newlineIndex === -1) {
          continue;
        }

        text = text.slice(newlineIndex + 1);
        this.discardingSeekFragment = false;
      }

      lines += this.consume(text);
    }

    const totalMs = Date.now() - pollStartedAt;

    if (totalMs >= SLOW_POLL_MS) {
      logger.info(
        `slow tail read file=${this.filePath} totalMs=${totalMs} statMs=${statMs} ` +
          `openMs=${openMs} readMs=${readMs} chunks=${chunks} bytes=${bytesReadTotal} lines=${lines}`,
      );
    }

    return { lines, restarted: false };
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.reset();
    this.inode = undefined;
  }

  private async reset(): Promise<void> {
    const handle = this.handle;
    this.handle = undefined;
    this.position = 0;
    this.carry = "";
    this.decoder = new StringDecoder("utf8");
    this.discardingSeekFragment = false;

    await handle?.close();
  }

  private consume(text: string): number {
    if (!text) {
      return 0;
    }

    this.carry += text;

    let lines = 0;
    let start = 0;
    let newline = this.carry.indexOf("\n", start);

    while (newline !== -1) {
      this.onLine(stripCarriageReturn(this.carry.slice(start, newline)));
      lines += 1;
      start = newline + 1;
      newline = this.carry.indexOf("\n", start);
    }

    this.carry = start === 0 ? this.carry : this.carry.slice(start);

    if (this.carry.length > MAX_CARRY_LENGTH) {
      this.onLine(this.carry);
      this.carry = "";
      lines += 1;
    }

    return lines;
  }
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
