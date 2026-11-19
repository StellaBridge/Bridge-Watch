import { useEffect, useSyncExternalStore } from "react";

type LabelMap = Readonly<Record<string, string>>;

let labels: LabelMap = {};
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return labels;
}

export function setBreadcrumbLabel(path: string, label: string) {
  if (labels[path] === label) return;
  labels = { ...labels, [path]: label };
  emit();
}

export function clearBreadcrumbLabel(path: string) {
  if (!(path in labels)) return;
  const next = { ...labels };
  delete next[path];
  labels = next;
  emit();
}

export function useBreadcrumbLabels(): LabelMap {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Replace the auto-generated label for `path` (e.g. a raw id or slug) with a
 * human-readable one while the calling component is mounted.
 */
export function useBreadcrumbLabel(path: string | undefined, label: string | undefined) {
  useEffect(() => {
    if (!path || !label) return;
    setBreadcrumbLabel(path, label);
    return () => clearBreadcrumbLabel(path);
  }, [path, label]);
}
