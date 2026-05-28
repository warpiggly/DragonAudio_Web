import React, { useState, useRef, useEffect } from 'react';

// ---- Configuración del EQ gráfico (9 bandas ISO 1-octava) ----
// Cada índice = 1 BiquadFilter encadenado en serie sobre la señal.
// Lowshelf en el extremo grave, highshelf en el extremo agudo,
// peaking (campana) en las bandas centrales con Q ≈ 1.41 (~1/2 octava).
const EQ_BANDS = [
  { freq: 31,   label: '31 Hz',  type: 'lowshelf'  },
  { freq: 63,   label: '63 Hz',  type: 'peaking'   },
  { freq: 125,  label: '125 Hz', type: 'peaking'   },
  { freq: 250,  label: '250 Hz', type: 'peaking'   },
  { freq: 500,  label: '500 Hz', type: 'peaking'   },
  { freq: 1000, label: '1 kHz',  type: 'peaking'   },
  { freq: 2000, label: '2 kHz',  type: 'peaking'   },
  { freq: 4000, label: '4 kHz',  type: 'peaking'   },
  { freq: 8000, label: '8 kHz',  type: 'highshelf' },
];

// Valores por defecto — referencia única usada por los botones ↺ (reset).
const DEFAULTS = {
  eqGains: EQ_BANDS.map(() => 0), // 0 dB → curva plana (sin coloración)
  compThreshold: -24,              // dB sobre el que el compresor empieza a actuar
  compRatio: 4,                    // 4:1 → compresión moderada
  pan: 0,                          // 0 = centro estéreo
  width: 1,                        // 1 = estéreo normal
  volume: 100,                     // 100 = ganancia unidad (nivel original)
};

export default function MusicPlayer() {
  // --- Fuentes externas embebidas (YouTube / SoundCloud) ---
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [soundcloudUrl, setSoundcloudUrl] = useState('');
  const [showSoundcloud, setShowSoundcloud] = useState(false);

  // --- Parámetros del procesador DSP (controlan los nodos Web Audio en vivo) ---
  const [eqGains, setEqGains] = useState(DEFAULTS.eqGains);              // ganancia dB por banda
  const [compThreshold, setCompThreshold] = useState(DEFAULTS.compThreshold);
  const [compRatio, setCompRatio] = useState(DEFAULTS.compRatio);
  const [pan, setPan] = useState(DEFAULTS.pan);                          // -1 izq · 0 centro · 1 der
  const [width, setWidth] = useState(DEFAULTS.width);                    // 0 mono · 1 normal · 2 amplio
  const [volume, setVolume] = useState(DEFAULTS.volume);                 // 0..600 % (master gain)

  // --- Estado del propio procesador (activo / errores de captura) ---
  const [eqActive, setEqActive] = useState(false);
  const [eqError, setEqError] = useState('');

  // --- Referencias a los nodos Web Audio (persisten entre renders, no disparan re-render) ---
  const audioCtxRef = useRef(null);     // AudioContext: motor del grafo de audio
  const streamRef = useRef(null);       // MediaStream capturado de la pestaña
  const eqFiltersRef = useRef([]);      // array de BiquadFilter, uno por banda del EQ
  const compressorRef = useRef(null);   // DynamicsCompressor: controla la dinámica
  const pannerRef = useRef(null);       // StereoPanner: balance L/R
  const widthGainsRef = useRef(null);   // 4 GainNodes que cruzan canales (ancho estéreo)
  const masterGainRef = useRef(null);   // ganancia final antes de la salida
  const analyserRef = useRef(null);     // AnalyserNode: FFT para el visualizador
  const canvasRef = useRef(null);       // <canvas> donde se dibujan las barras
  const rafRef = useRef(null);          // id de requestAnimationFrame (loop de dibujo)

  // Extrae el ID de 11 caracteres de un link de YouTube (formatos youtu.be/… y v=…).
  const extractYoutubeId = (url) => {
    const match = url.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  };

  const handleYoutube = () => {
    const id = extractYoutubeId(youtubeUrl);
    if (id) setVideoId(id);
  };

  const handleSoundcloud = () => {
    if (soundcloudUrl) setShowSoundcloud(true);
  };

  // Ancho estéreo por mezcla M/S simplificada:
  //   newL = L*(1+w)/2 + R*(1-w)/2
  //   newR = R*(1+w)/2 + L*(1-w)/2
  // w=0 → mono · w=1 → estéreo original · w=2 → cancela parte del mid (más ambiente)
  const applyWidth = (w) => {
    const g = widthGainsRef.current;
    if (!g) return;
    const direct = (1 + w) / 2;
    const cross = (1 - w) / 2;
    g.LL.gain.value = direct;
    g.RR.gain.value = direct;
    g.LR.gain.value = cross;
    g.RL.gain.value = cross;
  };

  // Loop del visualizador "nebulosa": cada frame combina espectro (FFT) +
  // forma de onda (time-domain) en una sola imagen con curvas espejadas,
  // gradientes, halo de bajos reactivo y motion-blur por trail semitransparente.
  const drawVisualizer = () => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) {
      rafRef.current = requestAnimationFrame(drawVisualizer);
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

    rafRef.current = requestAnimationFrame(drawVisualizer);
  };

  // Arranca toda la cadena DSP. Pide al usuario compartir una pestaña con audio,
  // construye el grafo Web Audio y lo conecta a la salida.
  // Ruta: source → [9 EQ] → compressor → splitter/merger (width) → panner → analyser → master → out
  const startEqualizer = async () => {
    setEqError('');
    try {
      // Capturamos pantalla + audio con los procesados del SO desactivados,
      // para que la música llegue lo más limpia posible.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
          sampleSize: 16,
        },
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        setEqError(
          'No se compartió audio. Vuelve a intentarlo y marca la casilla "Compartir audio de la pestaña".'
        );
        return;
      }

      // Reaplicamos restricciones ya sobre el track (algunos navegadores las ignoran en la solicitud).
      try {
        await audioTracks[0].applyConstraints({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
        });
      } catch (_) {}

      // Descartamos el video: solo necesitamos el audio. Ahorra GPU/CPU.
      stream.getVideoTracks().forEach((t) => t.stop());

      const audioStream = new MediaStream(audioTracks);
      const ctx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: 'playback',
      });
      const source = ctx.createMediaStreamSource(audioStream);

      // --- 1) Ecualizador gráfico de 9 bandas (1 BiquadFilter por banda) ---
      const filters = EQ_BANDS.map((band, i) => {
        const f = ctx.createBiquadFilter();
        f.type = band.type;
        f.frequency.value = band.freq;
        if (band.type === 'peaking') f.Q.value = 1.41; // ancho ≈ 1/2 octava
        f.gain.value = eqGains[i];
        return f;
      });

      // --- 2) Compresor dinámico ---
      // Reduce los picos que superan el threshold con la relación ratio:1.
      // knee=30 → transición suave alrededor del umbral; attack/release típicos para música.
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = compThreshold;
      compressor.ratio.value = compRatio;
      compressor.knee.value = 30;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // --- 3) Ancho estéreo (cross-mix L↔R) ---
      // Separamos canales con Splitter, los mezclamos con 4 GainNodes y los volvemos a unir.
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const gLL = ctx.createGain();
      const gRR = ctx.createGain();
      const gLR = ctx.createGain();
      const gRL = ctx.createGain();

      // --- 4) Paneo: balance simple izquierda/derecha (-1 a 1) ---
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;

      // --- 5) Analyser: lee la señal en paralelo y alimenta el visualizador.
      // fftSize=1024 → 512 bins, curva mucho más suave que con 256.
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;

      // --- 6) Master gain: volumen final antes de la salida ---
      const masterGain = ctx.createGain();
      masterGain.gain.value = volume / 100;

      // --- Cableado de la cadena: source → filter[0] → ... → filter[N] → compressor ---
      source.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }
      filters[filters.length - 1].connect(compressor);
      compressor.connect(splitter);

      // Cross-mix del ancho estéreo
      splitter.connect(gLL, 0);
      splitter.connect(gLR, 0);
      splitter.connect(gRL, 1);
      splitter.connect(gRR, 1);

      gLL.connect(merger, 0, 0);
      gRL.connect(merger, 0, 0);
      gLR.connect(merger, 0, 1);
      gRR.connect(merger, 0, 1);

      merger.connect(panner);
      panner.connect(analyser);
      analyser.connect(masterGain);
      masterGain.connect(ctx.destination);

      // Aplicamos el ancho inicial según el estado actual del slider
      const direct = (1 + width) / 2;
      const cross = (1 - width) / 2;
      gLL.gain.value = direct;
      gRR.gain.value = direct;
      gLR.gain.value = cross;
      gRL.gain.value = cross;

      // Guardamos referencias para poder modificar los nodos sin reconstruir el grafo
      audioCtxRef.current = ctx;
      streamRef.current = stream;
      eqFiltersRef.current = filters;
      compressorRef.current = compressor;
      pannerRef.current = panner;
      widthGainsRef.current = { LL: gLL, RR: gRR, LR: gLR, RL: gRL };
      masterGainRef.current = masterGain;
      analyserRef.current = analyser;

      // Si el usuario detiene la compartición desde el navegador, paramos limpiamente.
      audioTracks[0].addEventListener('ended', () => stopEqualizer());

      setEqActive(true);
      rafRef.current = requestAnimationFrame(drawVisualizer);
    } catch (err) {
      setEqError('No se pudo iniciar el ecualizador: ' + err.message);
    }
  };

  // Libera todos los recursos: animación, tracks de captura, AudioContext y refs.
  const stopEqualizer = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    eqFiltersRef.current = [];
    compressorRef.current = null;
    pannerRef.current = null;
    widthGainsRef.current = null;
    masterGainRef.current = null;
    analyserRef.current = null;

    const canvas = canvasRef.current;
    if (canvas) {
      const cctx = canvas.getContext('2d');
      cctx.fillStyle = '#0c0503';
      cctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    setEqActive(false);
  };

  // --- Sincronización estado React → nodos Web Audio ---
  // Cada vez que el usuario mueve un slider (o pulsa ↺), propagamos el valor
  // directamente al nodo correspondiente, sin reconstruir la cadena.
  useEffect(() => {
    eqFiltersRef.current.forEach((f, i) => {
      if (f) f.gain.value = eqGains[i];
    });
  }, [eqGains]);
  useEffect(() => { if (compressorRef.current) compressorRef.current.threshold.value = compThreshold; }, [compThreshold]);
  useEffect(() => { if (compressorRef.current) compressorRef.current.ratio.value = compRatio; }, [compRatio]);
  useEffect(() => { if (pannerRef.current) pannerRef.current.pan.value = pan; }, [pan]);
  useEffect(() => { applyWidth(width); }, [width]);
  useEffect(() => {
    // Rampa exponencial corta (~20 ms) para evitar clicks al saltar de volumen.
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume / 100, audioCtxRef.current.currentTime, 0.02);
    }
  }, [volume]);

  // Cleanup al desmontar: corta la animación, libera el stream y cierra el AudioContext.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  // Estilo del icono ↺ que aparece junto a cada slider.
  const resetBtnStyle = {
    background: 'transparent',
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '0 6px',
    fontSize: 12,
    cursor: 'pointer',
    color: '#666',
    lineHeight: '18px',
  };

  // Slider reutilizable. `defaultValue` es a dónde vuelve al pulsar el botón ↺.
  const slider = (label, value, setter, min, max, step = 1, unit = '', defaultValue = 0) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span>{label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#555', minWidth: 48, textAlign: 'right' }}>{value}{unit}</span>
          <button
            type="button"
            onClick={() => setter(defaultValue)}
            title={`Restablecer a ${defaultValue}${unit}`}
            style={resetBtnStyle}
          >↺</button>
        </span>
      </label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => setter(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );

  const sectionStyle = { background: '#fff', padding: 14, borderRadius: 8, marginBottom: 12, border: '1px solid #ddd' };
  const sectionTitle = { margin: '0 0 10px 0', fontSize: 14, color: '#333', textTransform: 'uppercase', letterSpacing: 1 };

  return (
    <div style={{ maxWidth: 800, margin: '30px auto', padding: 20 }}>
      <h1>🎵 Reproductor de Música</h1>

      {/* --- YouTube: pega un link y carga el reproductor oficial en un iframe. --- */}
      <div style={{ marginBottom: 30 }}>
        <h2>YouTube</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            placeholder="Pega link de YouTube"
            value={youtubeUrl}
            onChange={e => setYoutubeUrl(e.target.value)}
            style={{ flex: 1, padding: 10 }}
          />
          <button onClick={handleYoutube} style={{ padding: 10 }}>
            Cargar
          </button>
        </div>
        {videoId && (
          <iframe
            width="100%"
            height="400"
            src={`https://www.youtube.com/embed/${videoId}`}
            title="YouTube"
            frameBorder="0"
            allow="autoplay; encrypted-media"
            allowFullScreen
            style={{ marginTop: 10, borderRadius: 10 }}
          />
        )}
      </div>

      {/* --- SoundCloud: mismo flujo que YouTube usando su widget oficial. --- */}
      <div style={{ marginBottom: 30 }}>
        <h2>SoundCloud</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            placeholder="Pega link de SoundCloud"
            value={soundcloudUrl}
            onChange={e => setSoundcloudUrl(e.target.value)}
            style={{ flex: 1, padding: 10 }}
          />
          <button onClick={handleSoundcloud} style={{ padding: 10 }}>
            Cargar
          </button>
        </div>
        {showSoundcloud && (
          <iframe
            width="100%"
            height="166"
            scrolling="no"
            frameBorder="no"
            allow="autoplay"
            src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(soundcloudUrl)}&color=%23ff5500&auto_play=false`}
            style={{ marginTop: 10, borderRadius: 10 }}
          />
        )}
      </div>

      {/* --- Procesador DSP: EQ + compresor + estéreo + volumen master. --- */}
      <div style={{ background: '#f0f0f0', padding: 20, borderRadius: 10 }}>
        <h2 style={{ marginTop: 0 }}>🎛️ Procesador de Audio</h2>

        {/* Visualizador "dragón" — llamas espejadas + waveform + halo de brasas */}
        <canvas
          ref={canvasRef}
          width={760}
          height={200}
          style={{ width: '100%', height: 200, borderRadius: 8, background: '#0c0503', marginBottom: 12, display: 'block' }}
        />

        {/* Botón principal: pide permiso de captura o detiene el procesador. */}
        <div style={{ marginBottom: 15 }}>
          {!eqActive ? (
            <button
              onClick={startEqualizer}
              style={{
                padding: '10px 20px',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: 5,
                cursor: 'pointer',
              }}
            >
              ▶️ Activar (compartir pestaña con audio)
            </button>
          ) : (
            <button
              onClick={stopEqualizer}
              style={{
                padding: '10px 20px',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: 5,
                cursor: 'pointer',
              }}
            >
              ⏹️ Detener
            </button>
          )}
          {eqError && <p style={{ color: 'red', marginTop: 8 }}>{eqError}</p>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* EQ gráfico — 9 sliders verticales en fila, estilo ecualizador hardware clásico. */}
          <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
            <h3 style={sectionTitle}>Ecualizador (9 bandas)</h3>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: 4,
              padding: '10px 6px',
              background: '#1c1c1c',
              borderRadius: 6,
              border: '1px solid #333',
            }}>
              {EQ_BANDS.map((band, i) => {
                const gain = eqGains[i];
                const setBand = (v) => setEqGains((prev) => {
                  const next = [...prev];
                  next[i] = v;
                  return next;
                });
                return (
                  <div key={band.freq} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flex: 1,
                    minWidth: 0,
                  }}>
                    {/* Lectura en dB: verde si realza, rojo si atenúa, gris si está en 0. */}
                    <span style={{
                      fontSize: 11,
                      color: gain > 0 ? '#7bd88f' : gain < 0 ? '#ff6b6b' : '#888',
                      fontWeight: gain !== 0 ? 'bold' : 'normal',
                      marginBottom: 6,
                      minHeight: 14,
                      fontFamily: 'monospace',
                    }}>
                      {gain > 0 ? '+' : ''}{gain} dB
                    </span>

                    {/* Slider vertical (writing-mode) con línea central como referencia de 0 dB. */}
                    <div style={{ position: 'relative', height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 26,
                        height: 1,
                        background: '#555',
                        pointerEvents: 'none',
                      }} />
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={1}
                        value={gain}
                        onChange={(e) => setBand(Number(e.target.value))}
                        title={`${band.label} · ${gain} dB`}
                        style={{
                          writingMode: 'vertical-lr',
                          direction: 'rtl',
                          WebkitAppearance: 'slider-vertical', // fallback Chrome legacy
                          width: 20,
                          height: 150,
                          cursor: 'pointer',
                          accentColor: gain === 0 ? '#888' : gain > 0 ? '#28a745' : '#dc3545',
                        }}
                      />
                    </div>

                    {/* Etiqueta de la frecuencia central de la banda. */}
                    <span style={{ fontSize: 11, color: '#ccc', marginTop: 8, fontFamily: 'monospace' }}>
                      {band.label}
                    </span>

                    {/* Reset individual: vuelve esta banda a 0 dB. */}
                    <button
                      type="button"
                      onClick={() => setBand(DEFAULTS.eqGains[i])}
                      title={`Restablecer ${band.label} a 0 dB`}
                      style={{
                        ...resetBtnStyle,
                        marginTop: 4,
                        padding: '0 5px',
                        fontSize: 11,
                        background: '#2a2a2a',
                        borderColor: '#444',
                        color: '#ccc',
                      }}
                    >↺</button>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: '#888', margin: '10px 0 0 0', textAlign: 'center' }}>
              Sube para realzar la banda, baja para atenuarla. Línea central = 0 dB (sin cambio).
            </p>
          </div>

          {/* Compresor — control de dinámica (aplasta picos sobre threshold). */}
          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Compresor</h3>
            {slider('Threshold', compThreshold, setCompThreshold, -60, 0, 1, ' dB', DEFAULTS.compThreshold)}
            {slider('Ratio', compRatio, setCompRatio, 1, 20, 0.5, ':1', DEFAULTS.compRatio)}
            <p style={{ fontSize: 11, color: '#888', margin: 0 }}>
              Threshold más bajo = comprime más. Ratio alto = aplasta los picos.
            </p>
          </div>

          {/* Estéreo — paneo (balance L/R) y ancho de imagen estéreo. */}
          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Estéreo</h3>
            {slider('Paneo (L ← → R)', pan, setPan, -1, 1, 0.01, '', DEFAULTS.pan)}
            {slider('Ancho estéreo (0=mono · 1=normal · 2=amplio)', width, setWidth, 0, 2, 0.01, '', DEFAULTS.width)}
          </div>

          {/* Volumen master — ganancia final + avisos de seguridad auditiva. */}
          <div
            style={{
              ...sectionStyle,
              gridColumn: '1 / -1',
              borderColor:
                volume > 300 ? '#dc3545' : volume > 100 ? '#f0ad4e' : '#ddd',
              background:
                volume > 300 ? '#fff5f5' : volume > 100 ? '#fffaf0' : '#fff',
            }}
          >
            <h3 style={sectionTitle}>Volumen master</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>Volumen (100 = original · 600 = amplificado x6)</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      color:
                        volume > 300 ? '#dc3545' : volume > 100 ? '#c97a00' : '#555',
                      fontWeight: volume > 100 ? 'bold' : 'normal',
                    }}
                  >
                    {volume}
                  </span>
                  <button
                    type="button"
                    onClick={() => setVolume(DEFAULTS.volume)}
                    title="Restablecer a 100"
                    style={resetBtnStyle}
                  >↺</button>
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={600}
                step={1}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                style={{ width: '100%', accentColor: volume > 300 ? '#dc3545' : volume > 100 ? '#f0ad4e' : undefined }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#999' }}>
                <span>0</span>
                <span>100 (normal)</span>
                <span>300</span>
                <span>600 (máx)</span>
              </div>
            </div>

            {volume > 100 && volume <= 300 && (
              <div style={{ background: '#fff3cd', border: '1px solid #f0ad4e', padding: 10, borderRadius: 6, fontSize: 12, color: '#7a5a00' }}>
                ⚠️ <b>Estás amplificando por encima del nivel original.</b> Puede haber distorsión y el sonido es más fuerte de lo que tu sistema entrega normalmente. Cuida tus oídos y tus parlantes.
              </div>
            )}
            {volume > 300 && (
              <div style={{ background: '#f8d7da', border: '2px solid #dc3545', padding: 12, borderRadius: 6, fontSize: 12, color: '#721c24' }}>
                🚨 <b>VOLUMEN PELIGROSO.</b> Escuchar música por encima de 85 dB durante períodos prolongados puede causar <b>pérdida auditiva permanente</b>. A este nivel también puedes <b>quemar audífonos o parlantes</b> y la señal va a estar fuertemente distorsionada (clipping). Úsalo solo unos segundos y a volumen razonable en tus altavoces.
              </div>
            )}
          </div>
        </div>

        <ul style={{ fontSize: 12, color: '#666', paddingLeft: 18, marginTop: 12 }}>
          <li>Funciona en Chrome, Edge y Brave. No en Firefox ni Safari.</li>
          <li>
            En el diálogo elige <b>"Pestaña de Chrome"</b>, selecciona esta misma pestaña y activa <b>"Compartir audio de la pestaña"</b>.
          </li>
          <li>
            Baja el volumen del video de YouTube de arriba — el procesador reproduce su propia versión filtrada.
          </li>
        </ul>
      </div>
    </div>
  );
}
