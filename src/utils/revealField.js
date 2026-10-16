// Scroll a plan control into view, opening whatever hides it on the way
// (changelog 290). "Find a setting" switches to the right sub-tab or step
// first; the section then mounts, its fold may be closed, and in the
// Guided view the field may sit behind "More options". This polls for the
// element a few times, clicking closed folds by title and the section's
// "More options" button as needed, then highlights and focuses it. It
// resolves false when the control never shows up -- typically because its
// section's switch (or an Interview gate) is off -- so the caller can say
// so instead of jumping to nothing.
export const FLASH_CLASS = 'field-found';
export const FLASH_MS = 2200;

const closedFoldByTitle = (title) => {
  if (!title) return null;
  const heads = document.querySelectorAll('h3[role="button"][aria-expanded="false"]');
  for (const h of heads) if (h.textContent.replace(/▾/g, '').trim() === title) return h;
  return null;
};

function flash(el) {
  const group = el.closest('.form-group') || el.closest('.custom-switch') || el;
  group.classList.add(FLASH_CLASS);
  setTimeout(() => group.classList.remove(FLASH_CLASS), FLASH_MS);
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  try { el.focus({ preventScroll: true }); } catch { /* not focusable */ }
}

export function revealField(id, { folds = [], tries = 15, interval = 100 } = {}) {
  return new Promise((resolve) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const el = document.getElementById(id);
      if (el) {
        const hidden = el.closest('.guided-hidden');
        if (!hidden) { flash(el); resolve(true); return; }
        // Behind "More options": open it and look again next tick.
        const more = hidden.closest('.guided-section')?.querySelector('.guided-more[aria-expanded="false"]');
        if (more) more.click();
        else { resolve(false); return; }
      } else {
        for (const f of folds) { const h = closedFoldByTitle(f.title); if (h) h.click(); }
      }
      if (n >= tries) { resolve(false); return; }
      setTimeout(tick, interval);
    };
    tick();
  });
}
