import { toast } from "sonner";
import { keepStorage } from "@/services/VaultBackup";
import { isInstalled } from "./install";

const UPDATE_CHECK_MS = 60 * 60 * 1000;
const SAVE_WAIT_MS = 10_000;

let reloadRequested = false;

async function reloadSafely() {
  const waits: Promise<unknown>[] = [];
  window.dispatchEvent(new CustomEvent("zketch:before-reload", { detail: { waits } }));
  if (waits.length) {
    await Promise.race([Promise.allSettled(waits), new Promise((resolve) => setTimeout(resolve, SAVE_WAIT_MS))]);
  }
  location.reload();
}

function precacheOf(worker: ServiceWorker): Promise<string[] | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 2000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(Array.isArray(event.data) ? event.data : null);
    };
    worker.postMessage({ type: "PRECACHE" }, [channel.port2]);
  });
}

async function runsCodeOf(worker: ServiceWorker): Promise<boolean> {
  const loaded = performance
    .getEntriesByType("resource")
    .map((entry) => new URL(entry.name).pathname)
    .filter((path) => path.startsWith("/_astro/") && path.endsWith(".js"));
  if (!loaded.length) return false;
  const list = await precacheOf(worker);
  return !!list && loaded.every((path) => list.includes(path));
}

async function toasterReady(): Promise<void> {
  for (let i = 0; i < 50 && !document.querySelector('section[aria-label*="Notifications"]'); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function showUpdateToast(onReload: () => void) {
  await toasterReady();
  toast("A new version of zketch is ready", {
    id: "zketch-update",
    duration: Infinity,
    action: { label: "Reload", onClick: onReload },
  });
}

async function offerUpdate(reg: ServiceWorkerRegistration) {
  const worker = reg.waiting;
  if (!worker) return;
  const current = await runsCodeOf(worker);
  if (reg.waiting !== worker) return;
  if (current) {
    toast.dismiss("zketch-update");
    worker.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  await showUpdateToast(() => {
    reloadRequested = true;
    if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
    else void reloadSafely();
  });
}

async function onControllerChange() {
  if (reloadRequested) {
    void reloadSafely();
    return;
  }
  const controller = navigator.serviceWorker.controller;
  if (!controller || (await runsCodeOf(controller))) return;
  await showUpdateToast(() => void reloadSafely());
}

function watch(reg: ServiceWorkerRegistration) {
  if (reg.waiting && navigator.serviceWorker.controller) void offerUpdate(reg);
  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) void offerUpdate(reg);
    });
  });
}

function loaded(): Promise<void> {
  if (document.readyState === "complete") return Promise.resolve();
  return new Promise((resolve) => window.addEventListener("load", () => resolve(), { once: true }));
}

export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    return;
  }
  try {
    await loaded();
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    watch(reg);
    navigator.serviceWorker.addEventListener("controllerchange", () => void onControllerChange());
    let lastCheck = Date.now();
    const check = () => {
      if (Date.now() - lastCheck < UPDATE_CHECK_MS) return;
      lastCheck = Date.now();
      reg.update().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
    setInterval(check, UPDATE_CHECK_MS);
    if (isInstalled()) {
      void keepStorage();
      const ready = await navigator.serviceWorker.ready;
      ready.active?.postMessage({ type: "WARM_BRUSHES" });
    }
  } catch (error) {
    console.warn("Service worker registration failed:", error);
  }
}
