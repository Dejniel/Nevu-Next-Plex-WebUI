// Keep the resolver stable so a fullscreen change does not move an open portal
// during its closing transition. Each newly opened overlay resolves its host.
export function overlayContainer() {
  return document.fullscreenElement ?? document.body;
}
