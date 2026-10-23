import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState = "installed" | "prompt" | "apple" | "chromium" | "unsupported";

const INSTALLED_KEY = "zketch-installed";

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function markInstalled() {
  try {
    localStorage.setItem(INSTALLED_KEY, "1");
  } catch {
    return;
  }
}

function installedHere(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    try {
      localStorage.removeItem(INSTALLED_KEY);
    } catch {}
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    markInstalled();
    notify();
  });
}

export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    matchMedia("(display-mode: standalone)").matches ||
    matchMedia("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isApple(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return true;
  return /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|OPR\/|Firefox\//.test(ua);
}

function isChromium(): boolean {
  return /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent);
}

export function installState(): InstallState {
  if (typeof window === "undefined") return "unsupported";
  if (isInstalled()) return "installed";
  if (deferred) return "prompt";
  if (installedHere()) return "installed";
  if (isApple()) return "apple";
  if (isChromium()) return "chromium";
  return "unsupported";
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") markInstalled();
    return outcome === "accepted";
  } catch {
    return false;
  } finally {
    notify();
  }
}

export function useInstallState(): InstallState {
  const [state, setState] = useState<InstallState>(() => installState());
  useEffect(() => {
    const update = () => setState(installState());
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return state;
}
