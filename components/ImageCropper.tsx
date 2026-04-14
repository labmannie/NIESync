"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X, ZoomIn, ZoomOut, Check } from "lucide-react";

interface ImageCropperProps {
  file: File;
  onCrop: (croppedBlob: Blob) => void;
  onCancel: () => void;
  isUploading?: boolean;
}

export default function ImageCropper({
  file,
  onCrop,
  onCancel,
  isUploading = false,
}: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [canvasSize, setCanvasSize] = useState(280);

  // Pinch-to-zoom refs
  const lastPinchDistRef = useRef<number>(0);
  const pinchActiveRef = useRef(false);

  // Responsive canvas sizing
  useEffect(() => {
    const updateSize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxSize = Math.min(vw - 64, vh - 280, 400);
      setCanvasSize(Math.max(200, maxSize));
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Load image
  useEffect(() => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      imageRef.current = img;
      setLoaded(true);
      URL.revokeObjectURL(url);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Draw on canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvasSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const radius = size / 2 - 12;
    const cx = size / 2;
    const cy = size / 2;

    // Calculate image draw dimensions — fit the smaller side to the canvas
    const imgAspect = img.width / img.height;
    let drawW: number;
    let drawH: number;

    if (imgAspect > 1) {
      drawH = size * zoom;
      drawW = drawH * imgAspect;
    } else {
      drawW = size * zoom;
      drawH = drawW / imgAspect;
    }

    const drawX = (size - drawW) / 2 + offset.x;
    const drawY = (size - drawH) / 2 + offset.y;

    // 1) Fill entire canvas dark
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, size, size);

    // 2) Draw full image
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // 3) Draw translucent overlay OUTSIDE the circle
    //    Use a path that covers the entire canvas minus the circle
    ctx.save();
    ctx.beginPath();
    // Outer rect (clockwise)
    ctx.moveTo(0, 0);
    ctx.lineTo(size, 0);
    ctx.lineTo(size, size);
    ctx.lineTo(0, size);
    ctx.closePath();
    // Inner circle (counter-clockwise to create a hole)
    ctx.moveTo(cx + radius, cy);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fill("evenodd");
    ctx.restore();

    // 4) Circle border
    ctx.strokeStyle = "rgba(245, 166, 35, 0.65)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 5) Subtle inner glow
    ctx.strokeStyle = "rgba(245, 166, 35, 0.12)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
    ctx.stroke();
  }, [canvasSize, zoom, offset]);

  useEffect(() => {
    if (loaded) draw();
  }, [loaded, draw]);

  // --- Mouse handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // --- Touch handlers (drag + pinch-to-zoom) ---
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      // Pinch start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistRef.current = Math.hypot(dx, dy);
      pinchActiveRef.current = true;
    } else if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - offset.x,
        y: e.touches[0].clientY - offset.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && pinchActiveRef.current) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const delta = (dist - lastPinchDistRef.current) * 0.005;
      lastPinchDistRef.current = dist;
      setZoom((z) => Math.min(3, Math.max(0.5, z + delta)));
    } else if (e.touches.length === 1 && isDragging && !pinchActiveRef.current) {
      setOffset({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchActiveRef.current = false;
    }
    if (e.touches.length === 0) {
      setIsDragging(false);
    }
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.06 : 0.06;
    setZoom((z) => Math.min(3, Math.max(0.5, z + delta)));
  };

  // Crop and export
  const handleCrop = () => {
    const img = imageRef.current;
    if (!img) return;

    const outputSize = 512;
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = outputSize;
    cropCanvas.height = outputSize;
    const ctx = cropCanvas.getContext("2d");
    if (!ctx) return;

    const size = canvasSize;
    const radius = size / 2 - 12;
    const diameter = radius * 2;
    const scale = outputSize / diameter;

    const imgAspect = img.width / img.height;
    let drawW: number;
    let drawH: number;

    if (imgAspect > 1) {
      drawH = size * zoom;
      drawW = drawH * imgAspect;
    } else {
      drawW = size * zoom;
      drawH = drawW / imgAspect;
    }

    // Map from canvas space to crop space
    const originX = size / 2 - radius; // left edge of circle in canvas coords
    const originY = size / 2 - radius; // top edge of circle in canvas coords
    const imgDrawX = (size - drawW) / 2 + offset.x;
    const imgDrawY = (size - drawH) / 2 + offset.y;

    const cropX = (imgDrawX - originX) * scale;
    const cropY = (imgDrawY - originY) * scale;

    ctx.drawImage(img, cropX, cropY, drawW * scale, drawH * scale);

    // Apply circular mask
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.fill();

    cropCanvas.toBlob(
      (blob) => {
        if (blob) onCrop(blob);
      },
      "image/png",
      1
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-lg animate-[cropFadeIn_0.2s_ease-out] rounded-2xl border border-white/[0.08] bg-[#111] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.65)] sm:p-6"
        ref={containerRef}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888]">
              Crop Profile Photo
            </p>
            <p className="mt-1 text-sm text-[#aaa]">
              Drag to reposition · Pinch or scroll to zoom
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isUploading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[#888] transition-colors hover:text-white disabled:opacity-50"
            aria-label="Cancel crop"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Canvas */}
        <div className="mt-4 flex justify-center">
          {!loaded ? (
            <div
              className="flex items-center justify-center rounded-2xl bg-black/30"
              style={{ width: canvasSize, height: canvasSize }}
            >
              <Loader2 className="h-8 w-8 animate-spin text-[#f5a623]" />
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              style={{
                width: canvasSize,
                height: canvasSize,
                cursor: isDragging ? "grabbing" : "grab",
                touchAction: "none",
                borderRadius: "16px",
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
            />
          )}
        </div>

        {/* Zoom controls */}
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            disabled={zoom <= 0.5 || isUploading}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#aaa] transition-all hover:bg-white/[0.08] hover:text-white active:scale-95 disabled:opacity-40"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4.5 w-4.5" />
          </button>
          <div className="flex w-36 flex-col items-center">
            <input
              type="range"
              min="50"
              max="300"
              value={Math.round(zoom * 100)}
              onChange={(e) => setZoom(parseInt(e.target.value) / 100)}
              disabled={isUploading}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f5a623]"
            />
            <span className="mt-1.5 text-[11px] font-medium text-[#666]">
              {Math.round(zoom * 100)}%
            </span>
          </div>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
            disabled={zoom >= 3 || isUploading}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#aaa] transition-all hover:bg-white/[0.08] hover:text-white active:scale-95 disabled:opacity-40"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Actions */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isUploading}
            className="flex-1 rounded-xl border border-white/10 bg-transparent py-3.5 text-sm font-bold text-[#aaa] transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCrop}
            disabled={!loaded || isUploading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#f5a623] py-3.5 text-sm font-bold text-black transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Apply Crop
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
