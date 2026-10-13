import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * Renders a scannable Code 128 label for a copy or membership card.
 * Rendering client-side keeps label printing available offline at the desk.
 */
export default function Barcode({ value, height = 50, width = 1.6, displayValue = true, className }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, String(value), {
        format: 'CODE128',
        height,
        width,
        displayValue,
        fontSize: 13,
        margin: 6,
        lineColor: '#0f172a',
      });
    } catch {
      // An unencodable value simply renders nothing rather than breaking the page.
    }
  }, [value, height, width, displayValue]);

  if (!value) return null;
  return <svg ref={ref} className={className} role="img" aria-label={`Barcode ${value}`} />;
}
