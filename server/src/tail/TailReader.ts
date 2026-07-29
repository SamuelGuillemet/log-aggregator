import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export class TailReader {
  private readonly positions = new Map<string, number>();

  reset(): void {
    this.positions.clear();
  }

  async readAppendedLines(filePath: string): Promise<string[]> {
    const fileStats = await stat(filePath);
    const previousPosition = this.positions.get(filePath) ?? 0;
    const start = fileStats.size < previousPosition ? 0 : previousPosition;

    if (fileStats.size <= start) {
      return [];
    }

    const content = await readRange(filePath, start, fileStats.size - 1);
    this.positions.set(filePath, fileStats.size);

    return content.split(/\r?\n/).filter((line) => line.length > 0);
  }
}

function readRange(
  filePath: string,
  start: number,
  end: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = createReadStream(filePath, { start, end });

    stream.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
