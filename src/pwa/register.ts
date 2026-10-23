import { toast } from "sonner";
import { keepStorage } from "@/services/VaultBackup";
import { isInstalled } from "./install";

const UPDATE_CHECK_MS = 60 * 60 * 1000;

let updateRequested = false;

async function toasterReady(): Promise<void> {
  for (let i = 0; i < 50 && !document.querySelector('section[aria-label*="Notifications"]'); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function offerUpdate(reg: ServiceWorkerRegistration) {
  await toasterReady();
  toast("A new version of zketch is ready", {
    id: "zketch-update",
    duration: Infinity,
    action: {
      label: "Reload",
      onClick: () => {
        updateRequested = true;
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        else location.reload();
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
      if (reloading || (!hadController && !updateRequested)) return;
      reloading = true;
      location.reload();
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
