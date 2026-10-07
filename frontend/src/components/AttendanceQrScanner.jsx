import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

function cameraErrorMessage(error) {
  const detail = String(error?.message || error || '');
  if (/permission|notallowed|denied/i.test(detail)) return 'Camera access was blocked. Allow camera permission in your browser and try again.';
  if (/notfound|no camera|devicesnotfound/i.test(detail)) return 'No camera was found on this device.';
  return 'Camera could not start. Use HTTPS or localhost and check that another app is not using the camera.';
}

export default function AttendanceQrScanner({ onScan, disabled }) {
  const readerId = `attendance-reader-${useId().replace(/:/g, '')}`;
  const scannerRef = useRef(null);
  const startPromiseRef = useRef(null);
  const stopPromiseRef = useRef(null);
  const runRef = useRef(0);
  const mountedRef = useRef(false);
  const onScanRef = useRef(onScan);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  onScanRef.current = onScan;

  const stopCamera = useCallback(() => {
    if (stopPromiseRef.current) return stopPromiseRef.current;
    const scanner = scannerRef.current;
    if (!scanner) return Promise.resolve();
    const stopping = (async () => {
      try { await startPromiseRef.current; } catch { /* Start may have failed. */ }
      try { if (scanner.isScanning) await scanner.stop(); } catch { /* Release what we can. */ }
      try { scanner.clear(); } catch { /* The view may already be gone. */ }
      if (scannerRef.current === scanner) scannerRef.current = null;
    })();
    stopPromiseRef.current = stopping;
    void stopping.finally(() => { if (stopPromiseRef.current === stopping) stopPromiseRef.current = null; });
    return stopping;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runRef.current += 1;
      void stopCamera();
    };
  }, [stopCamera]);

  const closeCamera = async () => {
    runRef.current += 1;
    await stopCamera();
    if (mountedRef.current) setCameraOpen(false);
  };

  const openCamera = async () => {
    if (disabled || scannerRef.current || cameraOpen) return;
    if (window.isSecureContext === false) {
      setCameraError('Camera scanning needs HTTPS or localhost. Open the secure IEMS link on this device.');
      return;
    }
    const run = ++runRef.current;
    setCameraError('');
    setCameraOpen(true);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      if (!mountedRef.current || run !== runRef.current) return;
      const scanner = new Html5Qrcode(readerId, { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
      scannerRef.current = scanner;
      const onDecoded = (decodedText) => {
        if (run !== runRef.current) return;
        runRef.current += 1;
        void stopCamera().then(() => {
          if (!mountedRef.current) return;
          setCameraOpen(false);
          onScanRef.current(decodedText);
        });
      };
      const scanConfig = { fps: 10 };
      try {
        startPromiseRef.current = scanner.start({ facingMode: 'environment' }, scanConfig, onDecoded, () => {});
        await startPromiseRef.current;
      } catch (firstError) {
        if (run !== runRef.current || /permission|notallowed|denied/i.test(String(firstError))) throw firstError;
        const cameras = await Html5Qrcode.getCameras();
        const camera = cameras.find((item) => /back|rear|environment/i.test(item.label)) || cameras[0];
        if (!camera) throw firstError;
        startPromiseRef.current = scanner.start(camera.id, scanConfig, onDecoded, () => {});
        await startPromiseRef.current;
      }
      if (run !== runRef.current) await stopCamera();
    } catch (error) {
      await stopCamera();
      if (mountedRef.current && run === runRef.current) {
        setCameraError(cameraErrorMessage(error));
        setCameraOpen(false);
      }
    } finally {
      startPromiseRef.current = null;
    }
  };

  return <div className="mt-5">
    <button type="button" onClick={cameraOpen ? closeCamera : openCamera} disabled={disabled && !cameraOpen} className="btn-neon inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-60">
      {cameraOpen ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
      {cameraOpen ? 'Close camera' : 'Open camera scanner'}
    </button>
    {cameraError && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{cameraError}</p>}
    <div id={readerId} className={`attendance-camera mt-4 ${cameraOpen ? '' : 'hidden'}`} />
  </div>;
}
