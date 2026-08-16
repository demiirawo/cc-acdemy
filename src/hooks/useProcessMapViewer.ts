import { useEffect, type RefObject } from "react";

/**
 * Makes the process maps on a page readable.
 *
 * A map is stored in the page as plain SVG, so it already shows up wherever
 * page content is rendered. What it can't do on its own is get out of the way
 * of a narrow column: a wide diagram scrolls sideways in its block, which is
 * fine for a glance but poor for actually following a process. This adds a
 * "View larger" control to each map that opens it full-screen, with an option
 * to print just that diagram.
 *
 * Deliberately plain DOM: the content is injected as HTML, so there are no
 * React nodes here to hang anything off.
 */
export function useProcessMapViewer(ref: RefObject<HTMLElement | null>, contentKey?: unknown) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const cleanups: Array<() => void> = [];

    root.querySelectorAll<HTMLElement>(".process-map").forEach((map) => {
      if (map.querySelector(".process-map-zoom")) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "process-map-zoom";
      button.textContent = "View larger";

      const open = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        openOverlay(map);
      };

      button.addEventListener("click", open);
      map.appendChild(button);
      cleanups.push(() => {
        button.removeEventListener("click", open);
        button.remove();
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, [ref, contentKey]);
}

function openOverlay(map: HTMLElement) {
  const svg = map.querySelector("svg");
  if (!svg) return;

  const overlay = document.createElement("div");
  overlay.className = "process-map-overlay";

  const bar = document.createElement("div");
  bar.className = "process-map-overlay-bar";

  const printButton = document.createElement("button");
  printButton.type = "button";
  printButton.textContent = "Print";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";

  const stage = document.createElement("div");
  stage.className = "process-map-overlay-stage";

  const copy = svg.cloneNode(true) as SVGElement;
  // Scaled to fit the window rather than kept at its drawn size.
  copy.removeAttribute("width");
  copy.removeAttribute("height");
  copy.setAttribute("style", `${copy.getAttribute("style") ?? ""};max-width:100%;max-height:100%;height:auto`);
  stage.appendChild(copy);

  bar.append(printButton, closeButton);
  overlay.append(bar, stage);

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target === stage) close();
  });
  closeButton.addEventListener("click", close);
  printButton.addEventListener("click", () => printMap(svg));
  document.addEventListener("keydown", onKey);

  document.body.appendChild(overlay);
}

/** Prints the diagram on its own, rather than the whole page around it. */
function printMap(svg: SVGElement) {
  const win = window.open("", "_blank", "width=1000,height=760");
  if (!win) return;

  win.document.write(
    `<!doctype html><meta charset="utf-8"><title>Process map</title>` +
      `<style>body{margin:0;padding:24px;display:flex;justify-content:center}` +
      `svg{max-width:100%;height:auto}</style>` +
      svg.outerHTML,
  );
  win.document.close();
  win.focus();
  // Give the markup a moment to lay out before the print dialog appears.
  win.setTimeout(() => win.print(), 250);
}
