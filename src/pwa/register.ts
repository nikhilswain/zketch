import { toast } from "sonner";
import { keepStorage } from "@/services/VaultBackup";
import { isInstalled } from "./install";

const UPDATE_CHECK_MS = 60 * 60 * 1000;

async function toasterReady(): Promise<void> {
  for (let i = 0; i < 50 && !document.querySelector("section[aria-label*=\"Notifications\"]"); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function offerUpdate(worker: ServiceWorker) {
  await toasterReady();
  toast("A new version of zketch is ready", {
    id: "zketch-update",
    duration: Infinity,
    action: {
      label: "Reload",
      onClick: () => worker.postMessage({ type: "SKIP_WAITING" }),
    },
  });
}

function watch(reg: ServiceWorkerRegistration) {
  if (reg.waiting && navigator.serviceWorker.controller) void offerUpdate(reg.waiting);
  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) void offerUpdate(worker);
    });
  });
}

export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    watch(reg);
    let reloading = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    let lastCheck = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < UPDATE_CHECK_MS) return;
      lastCheck = Date.now();
      reg.update().catch(() => undefined);
    });
    if (isInstalled()) {
      void keepStorage();
      const ready = await navigator.serviceWorker.ready;
      ready.active?.postMessage({ type: "WARM_BRUSHES" });
    }
  } catch (error) {
    console.warn("Service worker registration failed:", error);
  }
}
