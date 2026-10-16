// Print one section on its own (changelog 297).
//
// The full report (.print-report-container) is always laid out for print,
// so every earlier "Print" button also printed the whole report behind its
// own page. A section print marks <body data-print-section="name">; the
// print CSS then hides the app and the report and shows only the matching
// .section-print[data-section="name"] sheet. The mark comes off when the
// print dialog closes, whichever way it closes.
export const PRINT_SECTION_ATTR = 'printSection';

export function printSection(name, { print = () => window.print(), onDone = () => {}, withReport = false } = {}) {
  if (typeof document === 'undefined') return;
  const body = document.body;
  body.dataset[PRINT_SECTION_ATTR] = name;
  // The full analysis report can ride along (the planner packet).
  if (withReport) body.dataset.printReport = 'yes';
  let done = false;
  const clear = () => {
    if (done) return;
    done = true;
    delete body.dataset[PRINT_SECTION_ATTR];
    delete body.dataset.printReport;
    window.removeEventListener('afterprint', clear);
    onDone();
  };
  window.addEventListener('afterprint', clear);
  try {
    print();
  } finally {
    // Some browsers return from print() only after the dialog closes and
    // never fire afterprint; clear on the next tick in that case too.
    setTimeout(clear, 1000);
  }
}
