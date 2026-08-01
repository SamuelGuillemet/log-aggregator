import type { LogEvent } from "@log-aggregator/shared";

export class LogEventBuffer {
  private readonly events: LogEvent[] = [];

  constructor(private readonly maxEvents: number) {}

  add(event: LogEvent): void {
    this.events.push(event);

    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
  }

  clear(): void {
    this.events.length = 0;
  }

  getEvents(): readonly LogEvent[] {
    return this.events;
  }
}
