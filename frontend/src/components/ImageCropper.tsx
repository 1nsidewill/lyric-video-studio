import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';

interface Props {
  imageUrl: string;
  onCrop: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

export default function ImageCropper({ imageUrl, onCrop, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropSize, setCropSize] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);

  useEffect(() => {
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      imgRef.current = img;
      const size = Math.min(img.width, img.height);
      setCropX((img.width - size) / 2);
      setCropY((img.height - size) / 2);
      setCropSize(size);
      setImgLoaded(true);
    };
  }, [imageUrl]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgLoaded) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const displayW = 400;
    const displayH = (img.height / img.width) * displayW;
    canvas.width = displayW;
    canvas.height = displayH;
    scaleRef.current = img.width / displayW;

    ctx.drawImage(img, 0, 0, displayW, displayH);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, displayW, displayH);

    const s = scaleRef.current;
    const sx = cropX / s, sy = cropY / s, ss = cropSize / s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, ss, ss);
    ctx.clip();
    ctx.drawImage(img, 0, 0, displayW, displayH);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, ss, ss);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(sx + (ss / 3) * i, sy);
      ctx.lineTo(sx + (ss / 3) * i, sy + ss);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx, sy + (ss / 3) * i);
      ctx.lineTo(sx + ss, sy + (ss / 3) * i);
      ctx.stroke();
    }
  }, [cropX, cropY, cropSize, imgLoaded]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: cropX, oy: cropY };
  };

  useEffect(() => {
    if (!dragging) return;
    const img = imgRef.current;
    if (!img) return;
    const onMove = (e: MouseEvent) => {
      const s = scaleRef.current;
      const dx = (e.clientX - dragStart.current.mx) * s;
      const dy = (e.clientY - dragStart.current.my) * s;
      const maxX = img.width - cropSize;
      const maxY = img.height - cropSize;
      setCropX(Math.max(0, Math.min(maxX, dragStart.current.ox + dx)));
      setCropY(Math.max(0, Math.min(maxY, dragStart.current.oy + dy)));
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, cropSize]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const img = imgRef.current;
    if (!img) return;
    const minSize = 100;
    const maxSize = Math.min(img.width, img.height);
    const delta = e.deltaY > 0 ? 40 : -40;
    const ns = Math.max(minSize, Math.min(maxSize, cropSize + delta));
    const cx = cropX + cropSize / 2;
    const cy = cropY + cropSize / 2;
    setCropSize(ns);
    setCropX(Math.max(0, Math.min(img.width - ns, cx - ns / 2)));
    setCropY(Math.max(0, Math.min(img.height - ns, cy - ns / 2)));
  };

  const doCrop = () => {
    const img = imgRef.current;
    if (!img) return;
    const out = document.createElement('canvas');
    out.width = cropSize;
    out.height = cropSize;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, cropX, cropY, cropSize, cropSize, 0, 0, cropSize, cropSize);
    out.toBlob(blob => { if (blob) onCrop(blob); }, 'image/jpeg', 0.95);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="glass rounded-2xl p-6 max-w-lg w-full mx-4 space-y-4">
        <h3 className="text-lg font-bold text-center" style={{ fontFamily: 'var(--font-display)' }}>
          CROP ARTWORK · 1:1
        </h3>
        <p className="text-xs text-center text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
          drag to move · scroll to resize
        </p>

        <div ref={containerRef} className="flex justify-center">
          <canvas ref={canvasRef} className="rounded-xl cursor-move max-w-full"
            onMouseDown={handleMouseDown} onWheel={handleWheel}
            style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
        </div>

        <div className="flex gap-3">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-semibold"
            style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            CANCEL
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={doCrop}
            className="flex-1 py-3 rounded-xl text-sm font-bold"
            style={{ fontFamily: 'var(--font-display)', background: 'linear-gradient(135deg, var(--color-accent), var(--color-neon-pink))' }}>
            APPLY CROP
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
