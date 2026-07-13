import { useEffect, useRef, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'spark' | 'ring' | 'glow';
}

const COLORS = ['#a855f7', '#22d3ee', '#ec4899', '#f97316', '#34d399', '#ffffff'];

export default function HitEffect({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
  }, [containerRef]);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const alive: Particle[] = [];

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity
        p.vx *= 0.99;
        p.life -= 1;

        if (p.life <= 0) continue;
        alive.push(p);

        const alpha = p.life / p.maxLife;

        if (p.type === 'spark') {
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (p.type === 'ring') {
          const progress = 1 - alpha;
          const radius = 20 + progress * 120;
          ctx.save();
          ctx.globalAlpha = alpha * 0.5;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2 * alpha;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else if (p.type === 'glow') {
          ctx.save();
          ctx.globalAlpha = alpha * 0.3;
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
          grad.addColorStop(0, p.color);
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      particlesRef.current = alive;
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-20"
    />
  );
}

export function emitHitParticles(
  particlesRef: React.MutableRefObject<Particle[]>,
  x: number,
  y: number,
  combo: number,
) {
  const intensity = Math.min(combo, 20);
  const count = 12 + intensity * 2;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 3 + Math.random() * 4 + intensity * 0.3;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    particlesRef.current.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 30 + Math.random() * 20,
      maxLife: 50,
      size: 2 + Math.random() * 3,
      color,
      type: 'spark',
    });
  }

  // Shockwave ring
  particlesRef.current.push({
    x, y,
    vx: 0, vy: 0,
    life: 25, maxLife: 25,
    size: 1,
    color: combo >= 10 ? '#ec4899' : combo >= 5 ? '#f97316' : '#a855f7',
    type: 'ring',
  });

  // Center glow
  if (combo >= 3) {
    particlesRef.current.push({
      x, y,
      vx: 0, vy: 0,
      life: 20, maxLife: 20,
      size: 15 + intensity * 2,
      color: combo >= 10 ? '#ec4899' : '#a855f7',
      type: 'glow',
    });
  }
}
