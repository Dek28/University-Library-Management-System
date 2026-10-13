import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import Modal from './Modal';

/**
 * Formats the desk can meet: Code 128 is what our own labels print, EAN/UPC
 * covers ISBN barcodes on book jackets, and Code 39 / QR cover older or
 * third-party cards. A short list keeps decoding fast on low-end phones.
 */
async function createReader() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.QR_CODE,
  ]]]);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
}

function cameraErrorMessage(error) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return 'The camera is only available over HTTPS or on localhost. Open the app from a secure address to scan.';
  }
  if (error?.name === 'NotAllowedError') return 'Camera access was blocked. Allow it in the browser’s site settings and try again.';
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (error?.name === 'NotReadableError') return 'The camera is in use by another application.';
  return error?.message || 'The camera could not be started.';
}

/** Live camera preview that reports the first barcode it reads. */
function ScannerView({ onDetected, onError }) {
  const videoRef = useRef(null);
  // Held in refs so a parent re-render does not restart the camera.
  const detectedRef = useRef(onDetected);
  const errorRef = useRef(onError);
  detectedRef.current = onDetected;
  errorRef.current = onError;

  useEffect(() => {
    let controls = null;
    let cancelled = false;

    (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('insecure');
        const reader = await createReader();
        if (cancelled) return;
        controls = await reader.decodeFromConstraints(
          // Prefer the rear camera on phones; laptops fall back to the webcam.
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          videoRef.current,
          (result, _error, ctrl) => {
            if (!result || cancelled) return;
            cancelled = true;
            ctrl.stop();
            navigator.vibrate?.(80);
            detectedRef.current(result.getText().trim());
          },
        );
        // The dialog may have closed while the camera was starting.
        if (cancelled) controls.stop();
      } catch (error) {
        if (!cancelled) errorRef.current(cameraErrorMessage(error));
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-lg bg-slate-950">
      <video ref={videoRef} className="aspect-4/3 w-full object-cover" muted playsInline />
      {/* Aiming guide: a barcode held inside the band decodes fastest. */}
      <div className="pointer-events-none absolute inset-x-[10%] top-1/2 h-1/3 -translate-y-1/2 rounded-md border-2 border-white/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.35)]" />
    </div>
  );
}

/**
 * "Camera" button for a scan box. Opens a live preview and hands the decoded
 * value to `onDetected`, exactly as a handheld scanner's keystrokes would.
 */
export default function CameraScanButton({ onDetected, title = 'Scan with camera', className, disabled }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const close = () => { setOpen(false); setError(''); };
  const handleDetected = (value) => {
    close();
    if (value) onDetected(value);
  };

  return (
    <>
      <Button type="button" variant="secondary" className={className} disabled={disabled} onClick={() => setOpen(true)}>
        Camera
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={title}
        description="Hold the barcode inside the frame. It is read automatically."
        size="md"
        footer={<Button variant="secondary" onClick={close}>Cancel</Button>}
      >
        {error
          ? <p className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>
          : <ScannerView onDetected={handleDetected} onError={setError} />}
      </Modal>
    </>
  );
}
