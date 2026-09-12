export const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000";

export const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://127.0.0.1:3000/ws";

/** Client-side ceiling on retained rows. v1 grew until the tab ran out of memory. */
export const MAX_CLIENT_EVENTS = 50_000;

export const PAGE_SIZE = 200;

export const FILTER_DEBOUNCE_MS = 200;
