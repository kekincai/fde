/**
 * Prints the current page as one ブランケット判 sheet (406 × 545 mm), the size
 * of a Japanese broadsheet. The @page rule and the print-only styles live in
 * app.css under `.is-printing`; this module sizes the sheet so the whole page
 * fits on one side of paper.
 */

const MM = 96 / 25.4;
/** Page box minus the 12 mm margins set in @page. */
const PAGE_WIDTH = Math.floor((406 - 24) * MM);
const PAGE_HEIGHT = Math.floor((545 - 24) * MM);

let savedTitle: string | null = null;
let fileName: () => string = () => '';

function fitSheet() {
  const root = document.documentElement;
  // Browsers name the saved PDF after the document title.
  const name = fileName();
  if (name) { savedTitle ??= document.title; document.title = name; }
  const sheet = document.querySelector<HTMLElement>('.sheet-of-paper');
  root.classList.add('is-printing');
  if (!sheet) return;
  // Lay the page out wider, then zoom it down, until it is as tall as the paper.
  let zoom = 1;
  for (let i = 0; i < 4; i += 1) {
    root.style.setProperty('--print-width', `${Math.round(PAGE_WIDTH / zoom)}px`);
    const next = Math.min(1, PAGE_HEIGHT / sheet.scrollHeight);
    if (Math.abs(next - zoom) < 0.005) { zoom = next; break; }
    zoom = next;
  }
  root.style.setProperty('--print-width', `${Math.round(PAGE_WIDTH / zoom)}px`);
  zoom = Math.min(zoom, PAGE_HEIGHT / sheet.scrollHeight);
  root.style.setProperty('--print-zoom', zoom.toFixed(4));
}

function clearSheet() {
  const root = document.documentElement;
  if (savedTitle !== null) { document.title = savedTitle; savedTitle = null; }
  root.classList.remove('is-printing');
  root.style.removeProperty('--print-width');
  root.style.removeProperty('--print-zoom');
}

/**
 * Fits the sheet for any print, including the browser's own print command,
 * and names the PDF with `getFileName` (read when printing starts).
 */
export function installPrintFit(getFileName: () => string): () => void {
  fileName = getFileName;
  // beforeprint runs under screen media, so a window narrower than 768px measures the mobile
  // layout. Measure again once print media applies (the print layout is the wide one).
  const printMedia = window.matchMedia('print');
  const onPrintMedia = (event: MediaQueryListEvent) => { if (event.matches) fitSheet(); };
  window.addEventListener('beforeprint', fitSheet);
  window.addEventListener('afterprint', clearSheet);
  printMedia.addEventListener('change', onPrintMedia);
  return () => {
    window.removeEventListener('beforeprint', fitSheet);
    window.removeEventListener('afterprint', clearSheet);
    printMedia.removeEventListener('change', onPrintMedia);
  };
}

export function printPaper() {
  window.print();
}
