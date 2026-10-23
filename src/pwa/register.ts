import { toast } from "sonner";
import { keepStorage } from "@/services/VaultBackup";
import { isInstalled } from "./install";

const UPDATE_CHECK_MS = 60 * 60 * 1000;

let updateRequested = false;
let silentSwitch = false;

async function reloadSafely() {
  const waits: Promise<unknown>[] = [];
  window.dispatchEvent(new CustomEvent("zketch:before-reload", { detail: { waits } }));
  await Promise.race([Promise.allSettled(waits), new Promise((resolve) => setTimeout(resolve, 2000))]);
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

async function runsNewCode(worker: ServiceWorker): Promise<boolean> {
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

async function offerUpdate(reg: ServiceWorkerRegistration) {
  const worker = reg.waiting;
  if (!worker) return;
  if (await runsNewCode(worker)) {
    toast.dismiss("zketch-update");
    silentSwitch = true;
    worker.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  await toasterReady();
  if (reg.waiting !== worker) return;
  toast("A new version of zketch is ready", {
    id: "zketch-update",
    duration: Infinity,
    action: {
      label: "Reload",
      onClick: () => {
        updateRequested = true;
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        else void reloadSafely();
      },
    },
  });
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
    const hadController = !!navigator.serviceWorker.controller;
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    watch(reg);
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (silentSwitch) {
        silentSwitch = false;
        return;
      }
      if (reloading || (!hadController && !updateRequested)) return;
      reloading = true;
      void reloadSafely();
    });
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
