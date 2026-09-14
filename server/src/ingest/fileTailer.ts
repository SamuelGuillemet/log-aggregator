import { createReadStream, type ReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import { logger } from "../util/logger.js";

/** A file with no newline at all must not grow an unbounded carry buffer. */
const MAX_CARRY_LENGTH = 4 * 1_024 * 1_024;
/** Above this, a single poll() is logged with a phase breakdown to find the slow part. */
const SLOW_POLL_MS = 200;
/**
 * `fs.createReadStream`'s default `highWaterMark` is 64 KiB, so on a high-latency
 * mount a naive read pays one round trip per 64 KiB. This makes each read as big
 * as the file itself so there is at most one round trip per poll — measured to
 * make no difference on the real slow share (a single ~3.4 MB read still took
 * ~7s, same throughput as 53 small reads), which means round-trip count was
 * never the bottleneck; a large value is kept anyway since it cannot hurt.
 */
const READ_HIGH_WATER_MARK = 8 * 1_024 * 1_024;

export interface PollResult {
  lines: number;
  /** The file was replaced or truncated, so previously emitted lines are stale. */
  restarted: boolean;
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
  private position = 0;
  private inode: number | undefined;
  private carry = "";
  private decoder = new StringDecoder("utf8");
  private activeStream: ReadStream | undefined;
  /** `close()` can land while a poll's read loop is still awaiting a chunk. */
  private closed = false;

  constructor(
    readonly filePath: string,
    private readonly onLine: (line: string) => void,
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
      this.reset();
      this.inode = stats.ino;

      return { lines: 0, restarted: true };
    }

    this.inode = stats.ino;

    if (this.closed || stats.size <= this.position) {
      return { lines: 0, restarted: false };
    }

    const start = this.position;
    const readStartedAt = Date.now();
    let lines = 0;
    let chunks = 0;
    let bytesReadTotal = 0;

    const stream = createReadStream(this.filePath, {
      start,
      end: stats.size - 1,
      highWaterMark: READ_HIGH_WATER_MARK,
    });

    this.activeStream = stream;

    try {
      for await (const chunk of stream) {
        // close() can land between two awaited chunks of the same poll; stop rather
        // than keep consuming a stream that was just torn down out from under us.
        if (this.closed) {
          break;
        }

        chunks += 1;
        bytesReadTotal += chunk.length;
        lines += this.consume(this.decoder.write(chunk));
      }
    } catch (error) {
      // destroy() during an in-flight iteration surfaces as a premature-close error;
      // that is expected teardown, not a real read failure.
      if (!this.closed) {
        throw error;
      }
    } finally {
      stream.destroy();

      if (this.activeStream === stream) {
        this.activeStream = undefined;
      }
    }

    this.position = start + bytesReadTotal;

    const readMs = Date.now() - readStartedAt;
    const totalMs = Date.now() - pollStartedAt;

    if (totalMs >= SLOW_POLL_MS) {
      logger.info(
        `slow tail read file=${this.filePath} totalMs=${totalMs} statMs=${statMs} ` +
          `readMs=${readMs} chunks=${chunks} bytes=${bytesReadTotal} lines=${lines}`,
      );
    }

    return { lines, restarted: false };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.activeStream?.destroy();
    this.reset();
    this.inode = undefined;
  }

  private reset(): void {
    this.activeStream?.destroy();
    this.activeStream = undefined;
    this.position = 0;
    this.carry = "";
    this.decoder = new StringDecoder("utf8");
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
