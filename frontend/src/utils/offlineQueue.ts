export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timestamp: number;
  retryCount: number;
}

const STORAGE_KEY = "bridge_watch_offline_queue_v1";

export function getQueuedRequests(): QueuedRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to read offline queue from storage", err);
    return [];
  }
}

export function saveQueuedRequests(queue: QueuedRequest[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent("bridgewatch:offline-queue-change", { detail: { count: queue.length } }));
  } catch (err) {
    console.error("Failed to save offline queue to storage", err);
  }
}

export function queueFailedRequest(req: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
}): QueuedRequest {
  const queue = getQueuedRequests();
  const queuedItem: QueuedRequest = {
    id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: typeof req.body === "string" ? req.body : req.body ? JSON.stringify(req.body) : undefined,
    timestamp: Date.now(),
    retryCount: 0,
  };

  queue.push(queuedItem);
  saveQueuedRequests(queue);
  return queuedItem;
}

export async function retryQueuedRequests(): Promise<{ successful: number; failed: number }> {
  if (!navigator.onLine) {
    return { successful: 0, failed: 0 };
  }

  const queue = getQueuedRequests();
  if (queue.length === 0) return { successful: 0, failed: 0 };

  const remaining: QueuedRequest[] = [];
  let successful = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers ? new Headers(item.headers) : undefined,
        body: item.body,
      });

      if (response.ok) {
        successful++;
      } else {
        item.retryCount++;
        if (item.retryCount < 5) {
          remaining.push(item);
        }
        failed++;
      }
    } catch {
      item.retryCount++;
      if (item.retryCount < 5) {
        remaining.push(item);
      }
      failed++;
    }
  }

  saveQueuedRequests(remaining);
  return { successful, failed };
}
