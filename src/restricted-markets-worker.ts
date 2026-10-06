import { mineBasketHookSalts, type HookMiningOptions } from "./restricted-markets.js";

export type HookMiningRequest =
  | { type: "mine"; id: string; options: Omit<HookMiningOptions, "signal" | "onProgress"> }
  | { type: "cancel"; id: string };
export type HookMiningWorkerPort = {
  onmessage: ((event: { data: HookMiningRequest }) => void) | null;
  postMessage(message: unknown): void;
};

/** Explicit worker entrypoint; importing the SDK's main entrypoint has no worker side effects. */
export function installBasketMiningWorker(port: HookMiningWorkerPort): () => void {
  const active = new Map<string, AbortController>();
  port.onmessage = ({ data }) => {
    if (!data || typeof data.id !== "string" || data.id.length === 0 || data.id.length > 128) return;
    if (data.type === "cancel") {
      active.get(data.id)?.abort();
      return;
    }
    if (data.type !== "mine") return;
    if (active.size !== 0) {
      port.postMessage({ type: "error", id: data.id, error: "worker already mining" });
      return;
    }
    const controller = new AbortController();
    active.set(data.id, controller);
    void mineBasketHookSalts({
      ...data.options, signal: controller.signal,
      onProgress: (nextEntropy, found) => port.postMessage({ type: "progress", id: data.id, nextEntropy, found }),
    }).then(
      results => port.postMessage({ type: "result", id: data.id, results }),
      error => port.postMessage({ type: "error", id: data.id, error: error instanceof Error ? error.message : String(error) }),
    ).finally(() => active.delete(data.id));
  };
  return () => {
    for (const controller of active.values()) controller.abort();
    port.onmessage = null;
  };
}

// Dedicated worker globals have postMessage and no document; Node imports remain inert.
const candidate = globalThis as unknown as HookMiningWorkerPort & { document?: unknown };
if (typeof candidate.postMessage === "function" && candidate.document === undefined) installBasketMiningWorker(candidate);
