import React, { useEffect, useRef, useState } from 'react';

/** Draw-or-type signature. Reports a PNG data URL (drawn) or the typed name; empty string when blank. */
export interface SignatureValue { type: 'DRAWN' | 'TYPED'; value: string }

export default function SignaturePad({ onChange }: { onChange: (v: SignatureValue | null) => void }) {
  const [mode, setMode] = useState<'DRAWN' | 'TYPED'>('DRAWN');
  const [typed, setTyped] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);

  useEffect(() => {
    if (mode === 'TYPED') onChange(typed.trim().length >= 2 ? { type: 'TYPED', value: typed.trim() } : null);
    else onChange(inked.current && canvas.current ? { type: 'DRAWN', value: canvas.current.toDataURL('image/png') } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typed]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvas.current!.getContext('2d')!;
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y); ctx.stroke();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
    inked.current = true;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (inked.current) onChange({ type: 'DRAWN', value: canvas.current!.toDataURL('image/png') });
  };
  const clear = () => {
    const c = canvas.current;
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    inked.current = false;
    onChange(null);
  };

  return (
    <div className="space-y-2">
      {mode === 'DRAWN' ? (
        <div>
          <canvas ref={canvas} width={480} height={160}
            className="w-full max-w-[480px] h-[160px] bg-white border border-gray-300 rounded-lg touch-none cursor-crosshair"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Signature drawing area" />
          <button type="button" className="text-xs text-gray-500 underline mt-1" onClick={clear}>Clear</button>
        </div>
      ) : (
        <div>
          <input className="form-input max-w-[480px]" placeholder="Type your full name" maxLength={80} value={typed} onChange={e => setTyped(e.target.value)} />
          {typed.trim() && <p className="mt-2 text-2xl text-gray-800 italic" style={{ fontFamily: '"Brush Script MT", "Segoe Script", cursive' }}>{typed}</p>}
        </div>
      )}
      <div className="flex gap-4 text-sm">
        <button type="button" onClick={() => { inked.current = false; setMode('DRAWN'); }} className={mode === 'DRAWN' ? 'font-bold text-blue-700 border-b-2 border-blue-600' : 'text-gray-500'}>draw</button>
        <button type="button" onClick={() => setMode('TYPED')} className={mode === 'TYPED' ? 'font-bold text-blue-700 border-b-2 border-blue-600' : 'text-gray-500'}>type</button>
      </div>
    </div>
  );
}
