import type { LogEvent, StatsSnapshot } from "@log-aggregator/shared";

export type EventBusPayloads = {
  log: LogEvent;
  stats: StatsSnapshot;
  error: { message: string; details?: string };
};

type Listener<T> = (payload: T) => void;

export class EventBus {
  private readonly listeners = new Map<
    keyof EventBusPayloads,
    Set<Listener<EventBusPayloads[keyof EventBusPayloads]>>
  >();

  on<K extends keyof EventBusPayloads>(
    event: K,
    listener: Listener<EventBusPayloads[K]>,
  ): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(
      listener as Listener<EventBusPayloads[keyof EventBusPayloads]>,
    );
    this.listeners.set(event, listeners);

    return () =>
      listeners.delete(
        listener as Listener<EventBusPayloads[keyof EventBusPayloads]>,
      );
  }

  emit<K extends keyof EventBusPayloads>(
    event: K,
    payload: EventBusPayloads[K],
  ): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }
}
