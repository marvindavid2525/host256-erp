import React, { useEffect, useRef, useState } from 'react';
import { Camera, ScanLine, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { CurrencyCode, Product } from '../types/erp';
import { formatCurrency } from '../utils/formatters';

interface BarcodeScannerModalProps {
  products: Product[];
  currency: CurrencyCode;
  onScanCode: (code: string) => { added: boolean; message: string };
  onClose: () => void;
}

interface DetectedBarcode {
  rawValue?: string;
}

interface BarcodeDetectorInstance {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  products,
  currency,
  onScanCode,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<{ code: string; ts: number }>({ code: '', ts: 0 });

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detectorSupported, setDetectorSupported] = useState<boolean>(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [continuousMode, setContinuousMode] = useState<boolean>(true);

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;

    const startScanner = async () => {
      const DetectorCtor = (
        window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
      ).BarcodeDetector;
      setDetectorSupported(Boolean(DetectorCtor));

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Browser camera API unavailable in this context. Use USB barcode gun or manual SKU entry below.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraActive(true);
        setCameraError(null);

        if (DetectorCtor) {
          const detector = new DetectorCtor({
            formats: [
              'ean_13',
              'ean_8',
              'upc_a',
              'upc_e',
              'code_128',
              'code_39',
              'qr_code',
            ],
          });

          intervalId = window.setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            try {
              const results = await detector.detect(videoRef.current);
              const raw = results[0]?.rawValue?.trim();
              if (!raw) return;

              const now = Date.now();
              if (
                lastScanRef.current.code === raw &&
                now - lastScanRef.current.ts < 1800
              ) {
                return;
              }
              lastScanRef.current = { code: raw, ts: now };
              const outcome = onScanCode(raw);
              setScanFeedback({ ok: outcome.added, text: outcome.message });
              if (outcome.added && !continuousMode) {
                stopCamera();
                onClose();
              }
            } catch {
              // Ignore transient frame decode errors
            }
          }, 260);
        }
      } catch (err) {
        if (!cancelled) {
          setCameraError(
            err instanceof Error
              ? `Camera permission or device unavailable (${err.message}). Use USB scanner or quick SKU tap below.`
              : 'Unable to access camera. Use USB barcode input or quick SKU tap below.'
          );
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
      stopCamera();
    };
  }, [continuousMode, onClose, onScanCode]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualBarcode.trim();
    if (!trimmed) return;
    const outcome = onScanCode(trimmed);
    setScanFeedback({ ok: outcome.added, text: outcome.message });
    if (outcome.added) {
      setManualBarcode('');
      if (!continuousMode) {
        stopCamera();
        onClose();
      }
    }
  };

  const quickProducts = products
    .filter((p) => p.status === 'active' && p.stockQty > 0)
    .slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-slate-800" />
            <h3 className="text-sm font-semibold text-slate-900">
              Camera &amp; Counter Barcode Scanner
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1 text-slate-400 hover:text-slate-800"
            aria-label="Close barcode scanner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-xs">
          {/* Live Camera Viewport */}
          <div className="relative overflow-hidden border border-slate-800 bg-slate-950 aspect-video flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`h-full w-full object-cover ${cameraActive ? 'opacity-100' : 'opacity-20'}`}
            />

            {cameraActive && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="h-32 w-64 border-2 border-emerald-400/90 bg-emerald-400/5 flex items-center justify-center">
                  <div className="h-0.5 w-56 bg-emerald-400/80" />
                </div>
                <span className="mt-2 bg-slate-950/80 px-2.5 py-1 font-mono text-[11px] text-slate-200">
                  {detectorSupported
                    ? 'Align EAN / UPC / Code-128 / QR barcode inside frame'
                    : 'Camera live · Hardware BarcodeDetector unavailable in this browser; use wedge/SKU input below'}
                </span>
              </div>
            )}

            {!cameraActive && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                Initializing camera lens...
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-200 bg-slate-950/90">
                <AlertTriangle className="h-6 w-6 text-amber-400 mb-2" />
                <p className="max-w-md text-xs leading-relaxed text-slate-300">
                  {cameraError}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={(e) => setContinuousMode(e.target.checked)}
                className="h-3.5 w-3.5 accent-slate-900"
              />
              <span>Continuous multi-item scan mode (keep scanner open after match)</span>
            </label>
            <span className="font-mono text-[11px] text-slate-500">
              Hotkey: Esc to close
            </span>
          </div>

          {/* USB Laser Scanner / Manual SKU Input */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                type="text"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="USB barcode gun or type exact SKU (e.g., LQU-TV43) + Enter..."
                className="w-full border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 font-mono text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              Add Barcode
            </button>
          </form>

          {scanFeedback && (
            <div
              className={`flex items-center gap-2 border p-2.5 text-xs ${
                scanFeedback.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {scanFeedback.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              )}
              <span>{scanFeedback.text}</span>
            </div>
          )}

          {/* Quick Counter Barcode Tap Grid */}
          {quickProducts.length > 0 && (
            <div className="border-t border-slate-200 pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Quick-Scan Active Counter Barcodes
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {quickProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      const outcome = onScanCode(p.sku);
                      setScanFeedback({ ok: outcome.added, text: outcome.message });
                      if (outcome.added && !continuousMode) {
                        stopCamera();
                        onClose();
                      }
                    }}
                    className="border border-slate-200 bg-slate-50 p-2 text-left hover:border-slate-400 hover:bg-white"
                  >
                    <div className="font-mono text-[11px] font-semibold text-slate-900 truncate">
                      {p.sku}
                    </div>
                    <div className="truncate text-[11px] text-slate-600">{p.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-emerald-700 tabular-nums">
                      {formatCurrency(p.sellingPrice, currency)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
