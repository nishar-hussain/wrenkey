export function fitText(el: HTMLElement): void {
  el.style.whiteSpace = "nowrap";
  el.style.fontSize = "100px";

  const parent = el.parentElement;
  if (!parent) return;

  const style = getComputedStyle(parent);
  const containerWidth =
    parent.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight);

  const lines = el.textContent?.split("\n") ?? [];
  let maxWidth = 0;

  const span = document.createElement("span");
  span.style.fontSize = "100px";
  span.style.fontWeight = "700";
  span.style.letterSpacing = "-0.06em";
  span.style.visibility = "hidden";
  span.style.position = "absolute";
  span.style.whiteSpace = "nowrap";
  document.body.appendChild(span);

  for (const line of lines) {
    span.textContent = line;
    maxWidth = Math.max(maxWidth, span.offsetWidth);
  }

  document.body.removeChild(span);

  if (maxWidth > 0) {
    el.style.fontSize = (100 * containerWidth) / maxWidth + "px";
  }

  el.style.whiteSpace = "pre-line";
}
