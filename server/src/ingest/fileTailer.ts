import { type FileHandle, open, stat } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";

const CHUNK_SIZE = 64 * 1_024;
/** A file with no newline at all must not grow an unbounded carry buffer. */
const MAX_CARRY_LENGTH = 4 * 1_024 * 1_024;

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
  private handle: FileHandle | undefined;
  private position = 0;
  private inode: number | undefined;
  private carry = "";
  private decoder = new StringDecoder("utf8");
  private readonly chunk = Buffer.allocUnsafe(CHUNK_SIZE);

  constructor(
    readonly filePath: string,
    private readonly onLine: (line: string) => void,
  ) {}

  /** Reads everything appended since the last call. */
  async poll(): Promise<PollResult> {
    const stats = await stat(this.filePath);

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

    if (stats.size <= this.position) {
      return { lines: 0, restarted: false };
    }

    this.handle ??= await open(this.filePath, "r");

    let lines = 0;

    while (this.position < stats.size) {
      const wanted = Math.min(CHUNK_SIZE, stats.size - this.position);
      const { bytesRead } = await this.handle.read(this.chunk, 0, wanted, this.position);

      if (bytesRead <= 0) {
        break;
      }

      this.position += bytesRead;
      lines += this.consume(this.decoder.write(this.chunk.subarray(0, bytesRead)));
    }

    return { lines, restarted: false };
  }

  async close(): Promise<void> {
    await this.reset();
    this.inode = undefined;
  }

  private async reset(): Promise<void> {
    const handle = this.handle;
    this.handle = undefined;
    this.position = 0;
    this.carry = "";
    this.decoder = new StringDecoder("utf8");

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
