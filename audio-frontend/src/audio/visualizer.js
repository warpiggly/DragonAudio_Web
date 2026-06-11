// ════════════════════════════════════════════════════════════════════════
//  VISUALIZADOR "nebulosa" — cada frame combina espectro (FFT) + forma de
//  onda (time-domain) en una sola imagen con curvas espejadas, gradientes,
//  halo de bajos reactivo y motion-blur por trail semitransparente.
//
//  Es puro dibujo en canvas: no toca el audio. Recibe getters (en vez de
//  nodos directos) porque el analyser/canvas pueden cambiar o no existir aún.
//  onBeat(bass) recibe la energía de graves 0..1 para que el fondo "lata".
// ════════════════════════════════════════════════════════════════════════

export function createVisualizerLoop({ getAnalyser, getCanvas, onBeat }) {
  let rafId = null;

  const frame = () => {
    const analyser = getAnalyser();
    const canvas = getCanvas();
    if (!analyser || !canvas) {
      rafId = requestAnimationFrame(frame);
      return;
    }
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cy = H / 2;

    // Leemos los dos dominios del Analyser en el mismo buffer length.
    const bins = analyser.frequencyBinCount;
    const freq = new Uint8Array(bins);
    const wave = new Uint8Array(bins);
    analyser.getByteFrequencyData(freq);
    analyser.getByteTimeDomainData(wave);

    // Energía de bajos (primer 10% del espectro) → modula brillo y glow.
    let bass = 0;
    const bassEnd = Math.max(1, Math.floor(bins * 0.1));
    for (let i = 0; i < bassEnd; i++) bass += freq[i];
    bass = bass / (bassEnd * 255); // normalizado 0..1

    // El fondo "late" con la música (variable CSS --beat la pone el caller).
    if (onBeat) onBeat(bass);

    // Trail: en lugar de borrar el frame entero, pintamos una capa semitransparente
    // encima. Los píxeles viejos se desvanecen gradualmente → sensación de "respiración".
    // Tono negro-rojizo para mantener la atmósfera dragón.
    ctx.fillStyle = 'rgba(15, 5, 3, 0.22)';
    ctx.fillRect(0, 0, W, H);

    // Halo radial de fondo (brasa) que crece con los bajos.
    const halo = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, W / 2);
    halo.addColorStop(0, `rgba(255, 90, 0, ${0.10 + bass * 0.40})`);
    halo.addColorStop(0.6, `rgba(180, 30, 0, ${0.05 + bass * 0.20})`);
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    // Solo usamos las primeras ~75% bandas: las agudísimas casi siempre están vacías.
    const useful = Math.floor(bins * 0.75);
    const step = W / useful;

    // Dibuja una curva suave (cuadrática) cerrada contra la línea central.
    // sign = -1 para arriba, +1 para abajo (espejo).
    const drawCurve = (sign, fill, glowColor) => {
      const pts = [];
      for (let i = 0; i < useful; i++) {
        const v = freq[i] / 255;
        const h = Math.pow(v, 0.85) * (cy * 0.95); // pequeña curva potencia: realza picos
        pts.push({ x: i * step, y: cy + sign * h });
      }
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i];
        const n = pts[i + 1];
        const mx = (p.x + n.x) / 2;
        const my = (p.y + n.y) / 2;
        ctx.quadraticCurveTo(p.x, p.y, mx, my);
      }
      ctx.lineTo(W, cy);
      ctx.closePath();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 18 + bass * 14;
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    // Mitad superior — llamas hacia arriba: amarillo incandescente (puntas) →
    // naranja → rojo profundo → brasas oscuras cerca del centro.
    const topGrad = ctx.createLinearGradient(0, 0, 0, cy);
    topGrad.addColorStop(0,    'rgba(255, 240, 130, 0.95)'); // punta blanca-amarilla (más caliente)
    topGrad.addColorStop(0.30, 'rgba(255, 160,  30, 0.80)'); // naranja brillante
    topGrad.addColorStop(0.65, 'rgba(220,  50,   0, 0.55)'); // rojo
    topGrad.addColorStop(1,    'rgba( 80,  10,   0, 0.05)'); // brasa apagada en la base
    drawCurve(-1, topGrad, 'rgba(255, 130, 0, 0.75)');

    // Mitad inferior — espejo: brasas en el centro → rojo → naranja → amarillo en la punta.
    const botGrad = ctx.createLinearGradient(0, cy, 0, H);
    botGrad.addColorStop(0,    'rgba( 80,  10,   0, 0.05)');
    botGrad.addColorStop(0.35, 'rgba(220,  50,   0, 0.55)');
    botGrad.addColorStop(0.70, 'rgba(255, 160,  30, 0.80)');
    botGrad.addColorStop(1,    'rgba(255, 240, 130, 0.95)');
    drawCurve(1, botGrad, 'rgba(255, 90, 0, 0.75)');

    // Forma de onda real (no FFT) cruzando el centro con un trazo blanco luminiscente.
    ctx.beginPath();
    const wfStep = W / wave.length;
    for (let i = 0; i < wave.length; i++) {
      const v = (wave[i] - 128) / 128; // -1..1
      const y = cy + v * (H * 0.18);
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * wfStep, y);
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(255, 245, 200, ${0.6 + bass * 0.35})`; // crema-cálida
    ctx.shadowColor = 'rgba(255, 180, 60, 0.95)';                  // glow naranja-dorado
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    rafId = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (rafId == null) rafId = requestAnimationFrame(frame);
    },
    stop() {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}

// Pinta el canvas en su estado "apagado" (al detener la captura).
export function paintIdle(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0c0503';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
