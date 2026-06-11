import React, { useRef, useEffect } from 'react';

// ════════════════════════════════════════════════════════════════════════
//  PERILLA DE VOLUMEN — "dial dragón"
//  Reemplaza el slider 0..600 por la perilla giratoria del diseño.
//
//  Geometría MEDIDA sobre las imágenes (ambas 1312×816, el knob ya viene
//  colocado en su sitio dentro del lienzo, así que se superpone 1:1):
//    · centro del knob = (30.26%, 52.76%)
//    · arco NEGRO  (zona normal, vol 0→100):  −122°  →  0°  (sube por la izq. hasta arriba)
//    · arco ROJO   (zona fuerte, vol 100→600):   0°  → +122° (baja por la derecha)
//  Ángulo 0° = arriba; positivo = sentido horario. El indicador rojo del
//  knob apunta hacia arriba en reposo, así que girar el knob θ° = apuntar a θ°.
// ════════════════════════════════════════════════════════════════════════
const KNOB = { cx: 0.3026, cy: 0.5276, imgW: 1312, imgH: 816, cxPx: 397, cyPx: 430.5 };
const ARC  = { aStart: -122, aMid: 0, aEnd: 122, vMin: 0, vMid: 100, vMax: 600, r: 168 };

const clampVol = (v) => Math.max(ARC.vMin, Math.min(ARC.vMax, v));

// volumen → ángulo (dos tramos lineales: el negro y el rojo del diseño)
const volToAngle = (v) =>
  v <= ARC.vMid
    ? ARC.aStart + ((v - ARC.vMin) / (ARC.vMid - ARC.vMin)) * (ARC.aMid - ARC.aStart)
    : ARC.aMid + ((v - ARC.vMid) / (ARC.vMax - ARC.vMid)) * (ARC.aEnd - ARC.aMid);

// ángulo → volumen (para el arrastre). El hueco inferior se redondea al extremo más cercano.
const angleToVol = (a) => {
  if (a > ARC.aEnd) a = ARC.aEnd;        // pasó el tope derecho → 600
  if (a < ARC.aStart) a = ARC.aStart;    // pasó el tope izquierdo → 0
  return Math.round(
    a <= ARC.aMid
      ? ARC.vMin + ((a - ARC.aStart) / (ARC.aMid - ARC.aStart)) * (ARC.vMid - ARC.vMin)
      : ARC.vMid + ((a - ARC.aMid) / (ARC.aEnd - ARC.aMid)) * (ARC.vMax - ARC.vMid)
  );
};

// punto polar en coordenadas de la imagen (0°=arriba, horario+)
const polar = (deg, r) => {
  const rad = (deg * Math.PI) / 180;
  return [KNOB.cxPx + r * Math.sin(rad), KNOB.cyPx - r * Math.cos(rad)];
};
// path SVG de un arco entre dos ángulos
const arcPath = (a0, a1, r) => {
  if (Math.abs(a1 - a0) < 0.1) return '';
  const [x0, y0] = polar(a0, r);
  const [x1, y1] = polar(a1, r);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

// Etiquetas numéricas alrededor del arco. (radio un poco mayor que el arco)
const KNOB_LABELS = [0, 50, 100, 200, 300, 450, 600];
const LABEL_R = 232;

export default function VolumeKnob({ volume, setVolume }) {
  const boxRef = useRef(null);
  const draggingRef = useRef(false);

  const angle = volToAngle(volume);
  const n = volume / ARC.vMax;                         // 0..1, "cuánta caña"
  const inRed = volume > ARC.vMid;
  const glowColor = volume > 300 ? '#ff2d2d' : inRed ? '#ff8a3d' : '#e8c36a';
  const glow = 0.22 + n * 0.78;                        // intensidad base del resplandor

  // Convierte la posición del puntero en volumen (respecto al centro del knob).
  const pointerToVolume = (clientX, clientY) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const cx = rect.left + rect.width * KNOB.cx;
    const cy = rect.top + rect.height * KNOB.cy;
    const a = (Math.atan2(clientX - cx, -(clientY - cy)) * 180) / Math.PI; // 0=arriba, horario+
    setVolume(angleToVol(a));
  };

  const onDown = (e) => {
    draggingRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    pointerToVolume(e.clientX, e.clientY);
  };
  const onMove = (e) => { if (draggingRef.current) pointerToVolume(e.clientX, e.clientY); };
  const onUp = (e) => {
    draggingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
  };

  // Rueda del ratón sobre la perilla = ajuste fino (listener nativo no-pasivo para poder
  // bloquear el scroll de la página mientras se gira).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setVolume((v) => clampVol(v + (e.deltaY < 0 ? 5 : -5)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setVolume]);

  // Teclado (accesibilidad): flechas ±5, Re/Av Pág ±25, Inicio/Fin = mín/máx.
  const onKeyDown = (e) => {
    const map = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 25, PageDown: -25 };
    if (e.key in map) { e.preventDefault(); setVolume((v) => clampVol(v + map[e.key])); }
    else if (e.key === 'Home') { e.preventDefault(); setVolume(ARC.vMin); }
    else if (e.key === 'End') { e.preventDefault(); setVolume(ARC.vMax); }
  };

  const goldEnd = Math.min(angle, ARC.aMid);           // tramo negro/dorado lleno (0..100)
  const zoneLabel = volume > 300 ? 'PELIGROSO' : inRed ? 'AMPLIFICADO' : volume === ARC.vMid ? 'ORIGINAL' : 'NORMAL';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        ref={boxRef}
        role="slider"
        aria-label="Volumen master"
        aria-valuemin={ARC.vMin}
        aria-valuemax={ARC.vMax}
        aria-valuenow={volume}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKeyDown}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 760,
          aspectRatio: `${KNOB.imgW} / ${KNOB.imgH}`,
          margin: '0 auto',
          userSelect: 'none',
          touchAction: 'none',
          cursor: 'grab',
          outline: 'none',
          // El dial entero se enciende un pelín con el volumen.
          filter: `brightness(${1 + n * 0.18}) saturate(${1 + n * 0.25})`,
          transition: 'filter 0.12s linear',
        }}
      >
        {/* Fondo: dragón + arco pintado */}
        <img
          src="/img/dial-bg.png"
          alt="Dial dragón"
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
        />

        {/* Halo que late con el volumen y con los graves (--beat). Detrás del knob, rebosa por el borde. */}
        <div
          style={{
            position: 'absolute',
            left: `${KNOB.cx * 100}%`,
            top: `${KNOB.cy * 100}%`,
            width: '34%',
            aspectRatio: '1 / 1',
            transform: `translate(-50%, -50%) scale(calc(${1 + n * 0.25} + var(--beat, 0) * 0.35))`,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${glowColor} 0%, transparent 68%)`,
            opacity: `calc(${glow * 0.55} + var(--beat, 0) * 0.4)`,
            mixBlendMode: 'screen',
            pointerEvents: 'none',
            transition: 'background 0.15s linear',
          }}
        />

        {/* Arco "lleno" que crece con el volumen: dorado (0-100) + rojo (100-600), encendido sobre el pintado. */}
        <svg
          viewBox={`0 0 ${KNOB.imgW} ${KNOB.imgH}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
        >
          {angle > ARC.aStart && (
            <path
              d={arcPath(ARC.aStart, goldEnd, ARC.r)}
              fill="none"
              stroke="#f4cf6b"
              strokeWidth={12}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 ${5 + n * 8}px rgba(244,207,107,0.95))` }}
            />
          )}
          {inRed && (
            <path
              d={arcPath(ARC.aMid, angle, ARC.r)}
              fill="none"
              stroke={volume > 300 ? '#ff2222' : '#ff5a2a'}
              strokeWidth={12}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 ${6 + n * 16}px rgba(255,60,20,0.95))` }}
            />
          )}
        </svg>

        {/* La perilla: misma imagen a tamaño completo, rota sobre su centro real. */}
        <img
          src="/img/knob.png"
          alt="Perilla de volumen"
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            transform: `rotate(${angle}deg)`,
            transformOrigin: `${KNOB.cx * 100}% ${KNOB.cy * 100}%`,
            transition: draggingRef.current ? 'none' : 'transform 0.12s ease-out',
            filter: `drop-shadow(0 0 ${6 + n * 26}px ${glowColor}) brightness(${1 + n * 0.35})`,
            pointerEvents: 'none',
          }}
        />

        {/* Etiquetas numéricas alrededor del arco */}
        {KNOB_LABELS.map((v) => {
          const [lx, ly] = polar(volToAngle(v), LABEL_R);
          const isBoundary = v === ARC.vMid;
          const reached = volume >= v;
          return (
            <span
              key={v}
              style={{
                position: 'absolute',
                left: `${(lx / KNOB.imgW) * 100}%`,
                top: `${(ly / KNOB.imgH) * 100}%`,
                transform: 'translate(-50%, -50%)',
                fontSize: 'clamp(9px, 2.2vw, 13px)',
                fontWeight: isBoundary || v === ARC.vMax ? 800 : 600,
                fontFamily: 'monospace',
                color: v > ARC.vMid ? (v > 300 ? '#ff5a4a' : '#ffae5a') : '#f0d68a',
                textShadow: reached
                  ? `0 0 7px ${v > ARC.vMid ? 'rgba(255,80,40,0.9)' : 'rgba(240,200,110,0.9)'}`
                  : '0 1px 2px rgba(0,0,0,0.8)',
                opacity: reached ? 1 : 0.55,
                pointerEvents: 'none',
                transition: 'opacity 0.12s, text-shadow 0.12s',
              }}
            >
              {v}
            </span>
          );
        })}

        {/* Lectura grande del valor, en el espacio libre del pergamino */}
        <div
          style={{
            position: 'absolute',
            left: '56%',
            top: '30%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontSize: 'clamp(14px, 2.4vw, 22px)',
              fontWeight: 900,
              fontFamily: "'Cinzel', serif",
              lineHeight: 1,
              color: glowColor,
              textShadow: `0 0 ${10 + n * 26}px ${glowColor}, 0 2px 4px rgba(0,0,0,0.7)`,
              transform: `scale(calc(1 + var(--beat, 0) * ${0.04 + n * 0.06}))`,
            }}
          >
            {volume}
          </div>
          <div
            style={{
              fontSize: 'clamp(8px, 2vw, 12px)',
              letterSpacing: 2,
              marginTop: 4,
              fontWeight: 700,
              color: volume > 300 ? '#ff5a4a' : inRed ? '#ffae5a' : '#caa75f',
              textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            }}
          >
            {zoneLabel}
          </div>
        </div>
      </div>

      {/* Pie de ayuda */}
      <p style={{ fontSize: 11, color: '#b89b6a', margin: '6px 0 0', textAlign: 'center' }}>
        Gira la perilla (arrastra o usa la rueda) · <span style={{ color: '#f0d68a' }}>0–100 normal</span> ·{' '}
        <span style={{ color: '#ff8a3d' }}>100–600 amplificado (zona roja)</span>
      </p>
    </div>
  );
}
