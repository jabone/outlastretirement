// Chart details on a phone (changelog 325). recharts shows a chart's
// details card on hover and hides it on mouseleave. A tap counts as a hover,
// but a finger never "leaves", so on a phone the card either stuck open over
// the chart or, on the Dashboard chart, was closed by a timer after 1.2
// seconds -- too quick to read five lines of figures.
//
// Now a tap shows the card and it stays until you tap somewhere else: one
// listener on the document hides the card of every chart the touch was
// not on. Mouse and pen are left alone; hover already works for them.

// recharts clears the card on its wrapper's mouseleave, which React builds
// from a mouseout whose relatedTarget is outside the chart. It has to come
// from the plot's own <svg> (the wrapper's direct child): the legend's
// little icons are svgs too, and come first in the DOM.
export function hideChartTooltip(wrapper) {
  const plot = wrapper.querySelector(':scope > svg') || wrapper;
  plot.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: wrapper.ownerDocument.body }));
}

export function installChartTouchDismiss(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || doc.__chartTouchDismiss) return () => {};
  const onPointerDown = (event) => {
    if (event.pointerType && event.pointerType !== 'touch') return;
    const target = event.target;
    for (const wrapper of doc.querySelectorAll('.recharts-wrapper')) {
      if (target && wrapper.contains(target)) continue;
      hideChartTooltip(wrapper);
    }
  };
  doc.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  doc.__chartTouchDismiss = true;
  return () => {
    doc.removeEventListener('pointerdown', onPointerDown, { capture: true });
    delete doc.__chartTouchDismiss;
  };
}
