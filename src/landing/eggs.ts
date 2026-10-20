import { getDoodleMode, setDoodleMode } from "./hero";
import { prefersReducedMotion } from "./ticker";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const JOKES = [
  "ok, you erased the headline. it was a good headline.",
  "scribbling over our copy? bold. we respect it.",
  "that's not how erasers work. it worked anyway.",
];

function toast(text: string) {
  const el = document.createElement("p");
  el.className = "lp-toast";
  el.setAttribute("role", "status");
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.classList.add("lp-toast-out"), 2200);
  setTimeout(() => el.remove(), 2700);
}

export function mountEggs(root: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {};
  const headline = root.querySelector<HTMLElement>("[data-headline]");
  const joke = root.querySelector<HTMLElement>("[data-joke]");
  let flips: number[] = [];
  let lastX = 0;
  let lastDir = 0;
  let busy = false;
  let jokeIndex = 0;

  const onMove = (e: PointerEvent) => {
    if (busy || e.pointerType === "touch") return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    if (Math.abs(dx) < 3) return;
    const dir = Math.sign(dx);
    if (dir !== lastDir && lastDir !== 0) {
      const now = performance.now();
      flips = flips.filter((t) => now - t < 1500);
      flips.push(now);
      if (flips.length >= 12) {
        flips = [];
        erase();
      }
    }
    lastDir = dir;
  };

  const erase = () => {
    if (!headline || !joke) return;
    busy = true;
    headline.classList.add("lp-erased");
    joke.textContent = JOKES[jokeIndex++ % JOKES.length];
    joke.hidden = false;
    setTimeout(() => {
      joke.hidden = true;
      headline.classList.remove("lp-erased");
      headline.classList.add("lp-redraw");
      setTimeout(() => {
        headline.classList.remove("lp-redraw");
        busy = false;
      }, 900);
    }, 3200);
  };

  let keys: string[] = [];
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable]")) return;
    keys = [...keys, e.key.length === 1 ? e.key.toLowerCase() : e.key].slice(-KONAMI.length);
    if (keys.length === KONAMI.length && keys.every((k, i) => k === KONAMI[i])) {
      keys = [];
      const next = getDoodleMode() === "watercolor" ? "normal" : "watercolor";
      setDoodleMode(next);
      document.documentElement.dataset.mode = next;
      toast(next === "watercolor" ? "watercolor mode. everything bleeds now." : "back to normal. mostly.");
    }
  };

  headline?.addEventListener("pointermove", onMove);
  addEventListener("keydown", onKey);
  return () => {
    headline?.removeEventListener("pointermove", onMove);
    removeEventListener("keydown", onKey);
  };
}
