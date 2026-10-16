// Wait for every image under `root` to finish loading (or fail), up to
// `timeoutMs` (changelog 333).
//
// The print sheets (the planner packet, the spending review) are mounted a
// frame before the print dialog opens. Their logo is a fresh <img>, and
// Chrome took its snapshot before the file arrived, so the printed header
// had no logo. Printing now waits for the images first; a missing file or a
// slow one cannot hold the dialog back for more than the timeout.
export function whenImagesReady(root, timeoutMs = 1000) {
  const imgs = root ? [...root.querySelectorAll('img')] : [];
  const pending = imgs.filter((img) => !img.complete);
  if (pending.length === 0) return Promise.resolve();
  const each = pending.map((img) => new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  }));
  return Promise.race([
    Promise.all(each),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]).then(() => undefined);
}
