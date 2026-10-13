import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, ErrorState } from '../../components/ui';

/**
 * In-app viewers for repository documents.
 *
 * Each viewer receives the already-authorised file as a Blob. The rendering
 * libraries are loaded on demand, so their weight is only paid by someone who
 * actually opens that kind of document.
 */

const FORMATS = {
  pdf: { mime: ['application/pdf'], ext: ['.pdf'] },
  docx: { mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ext: ['.docx'] },
  pptx: { mime: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], ext: ['.pptx'] },
  epub: { mime: ['application/epub+zip'], ext: ['.epub'] },
};

/** Which viewer can show this item, or null when it can only be downloaded. */
export function viewerKind(item) {
  if (!item) return null;
  const name = String(item.originalName || '').toLowerCase();
  const match = Object.entries(FORMATS).find(([, f]) => f.mime.includes(item.mimeType)
    || f.ext.some((ext) => name.endsWith(ext)));
  return match ? match[0] : null;
}

/** Shared frame: a fixed-height, scrollable reading area. */
const FRAME = 'h-[calc(100vh-14rem)] min-h-[480px] w-full';

function useRendered(render, deps) {
  const ref = useRef(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup = null;
    setStatus('loading');
    setError(null);

    // A fresh host per run, so a render that finishes after the effect was torn
    // down (e.g. React's double-run in development) cannot pile onto the next.
    const host = document.createElement('div');
    host.style.height = '100%';
    ref.current.appendChild(host);

    render(host, () => cancelled)
      .then((dispose) => {
        if (cancelled) {
          if (typeof dispose === 'function') dispose();
          return;
        }
        cleanup = dispose;
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setStatus('error');
      });

    return () => {
      cancelled = true;
      if (typeof cleanup === 'function') cleanup();
      host.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, status, error };
}

function ViewerState({ status, error, label }) {
  if (status === 'error') {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-panel">
        <ErrorState message={`This ${label} could not be displayed. ${error?.message || ''}`.trim()} />
      </div>
    );
  }
  if (status === 'loading') {
    return <div className="skeleton absolute inset-0" aria-label={`Loading ${label}`} />;
  }
  return null;
}

/** PDF: the browser's own viewer. */
export function PdfViewer({ blob, title, allowDownload }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!url) return <div className={`skeleton ${FRAME}`} />;

  // Hiding the toolbar removes its save/print buttons for read-only items.
  return (
    <iframe
      title={`Reading: ${title}`}
      src={allowDownload ? url : `${url}#toolbar=0&navpanes=0`}
      className={`block border-0 bg-slate-100 ${FRAME}`}
    />
  );
}

/** Word (.docx): rendered page by page. */
export function DocxViewer({ blob }) {
  const { ref, status, error } = useRendered(async (container) => {
    const { renderAsync } = await import('docx-preview');
    await renderAsync(blob, container, undefined, {
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
      experimental: true,
    });
  }, [blob]);

  return (
    <div className={`relative ${FRAME}`}>
      <div ref={ref} className="docx-viewer h-full overflow-auto bg-slate-100" />
      <ViewerState status={status} error={error} label="document" />
    </div>
  );
}

/** Resolves once `el` has been laid out with a usable width. */
function waitForWidth(el, min = 200) {
  if (el.clientWidth >= min) return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new ResizeObserver(() => {
      if (el.clientWidth >= min) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(el);
  });
}

// pptx-preview labels untitled charts with a Chinese placeholder ("Chart Title").
const CHART_TITLE_PLACEHOLDER = '图表标题';

/** PowerPoint (.pptx): every slide, one under another. */
export function PptxViewer({ blob }) {
  const { ref, status, error } = useRendered(async (container) => {
    const { init } = await import('pptx-preview');
    await waitForWidth(container);
    // The library's own wrapper scrolls; slides are sized a little narrower
    // than it so the scrollbar never pushes them sideways (see .pptx-viewer CSS).
    const width = container.clientWidth - 40;
    // Charts are drawn (and redrawn) after preview() returns, so watch for the
    // placeholder instead of removing it once.
    const hidePlaceholders = () => container.querySelectorAll('text').forEach((node) => {
      if (node.textContent === CHART_TITLE_PLACEHOLDER) node.remove();
    });
    const observer = new MutationObserver(hidePlaceholders);
    observer.observe(container, { childList: true, subtree: true });

    const previewer = init(container, { width, height: container.clientHeight, mode: 'list' });
    await previewer.preview(await blob.arrayBuffer());
    hidePlaceholders();
    return () => {
      observer.disconnect();
      previewer.destroy?.();
    };
  }, [blob]);

  return (
    <div className={`relative ${FRAME}`}>
      <div ref={ref} className="pptx-viewer h-full bg-slate-100" />
      <ViewerState status={status} error={error} label="presentation" />
    </div>
  );
}

/** EPUB: paginated reader with chapter list and page turning. */
export function EpubViewer({ blob }) {
  const renditionRef = useRef(null);
  const [toc, setToc] = useState([]);
  const [chapter, setChapter] = useState('');
  const [progress, setProgress] = useState(null);

  const { ref, status, error } = useRendered(async (container, isCancelled) => {
    const ePub = (await import('epubjs')).default;
    const book = ePub(await blob.arrayBuffer());
    // Scripts inside the book stay disabled (epub.js sandboxes its iframe).
    const rendition = book.renderTo(container, { width: '100%', height: '100%', flow: 'paginated', spread: 'auto' });
    renditionRef.current = rendition;

    rendition.on('relocated', (location) => {
      setChapter(location.start?.href || '');
      if (book.locations.length()) {
        setProgress(Math.round(book.locations.percentageFromCfi(location.start.cfi) * 100));
      }
    });
    const onKey = (event) => {
      if (event.key === 'ArrowLeft') rendition.prev();
      if (event.key === 'ArrowRight') rendition.next();
    };
    rendition.on('keyup', onKey);
    window.addEventListener('keyup', onKey);

    await rendition.display();
    // Chapter list and page percentages are extras: load them in the background.
    book.loaded.navigation
      .then((navigation) => { if (!isCancelled()) setToc(navigation.toc || []); })
      .catch(() => {});
    book.ready.then(() => book.locations.generate(1600)).catch(() => {});

    return () => {
      window.removeEventListener('keyup', onKey);
      renditionRef.current = null;
      book.destroy();
    };
  }, [blob]);

  const go = (href) => renditionRef.current?.display(href);

  return (
    <div className={`flex flex-col ${FRAME}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Button variant="secondary" size="sm" onClick={() => renditionRef.current?.prev()} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => renditionRef.current?.next()} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
        {toc.length > 0 && (
          <select
            className="form-control h-8 max-w-xs py-0 text-sm"
            value={toc.find((t) => chapter && chapter.startsWith(t.href.split('#')[0]))?.href || ''}
            onChange={(e) => go(e.target.value)}
            aria-label="Chapter"
          >
            <option value="" disabled>Chapters</option>
            {toc.map((t) => <option key={t.id || t.href} value={t.href}>{t.label.trim()}</option>)}
          </select>
        )}
        {progress !== null && <span className="ml-auto text-xs text-slate-500">{progress}% read</span>}
      </div>
      <div className="relative flex-1 bg-white">
        <div ref={ref} className="absolute inset-0 px-2 py-4 sm:px-8" />
        <ViewerState status={status} error={error} label="e-book" />
      </div>
    </div>
  );
}
