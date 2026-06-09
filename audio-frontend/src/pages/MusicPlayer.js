import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import API from '../api';

const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });

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
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [visualMode, setVisualMode] = useState(
    () => localStorage.getItem('dragonVisualMode') || 'full'
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('dragonTestCompleted');
    localStorage.removeItem('dragonActiveTestId');
    localStorage.removeItem('dragonVisualMode');
    navigate('/');
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const toggleVisualMode = () => {
    const next = visualMode === 'full' ? 'simple' : 'full';
    setVisualMode(next);
    localStorage.setItem('dragonVisualMode', next);
  };

  // --- Parámetros del procesador DSP (controlan los nodos Web Audio en vivo) ---
  const [eqGains, setEqGains] = useState(DEFAULTS.eqGains);              // ganancia dB por banda
  const [compThreshold, setCompThreshold] = useState(DEFAULTS.compThreshold);
  const [compRatio, setCompRatio] = useState(DEFAULTS.compRatio);
  const [pan, setPan] = useState(DEFAULTS.pan);                          // -1 izq · 0 centro · 1 der
  const [width, setWidth] = useState(DEFAULTS.width);                    // 0 mono · 1 normal · 2 amplio
  const [volume, setVolume] = useState(DEFAULTS.volume);                 // 0..600 % (master gain)

  // --- Solo / Mute por efecto ---
  // mute = el efecto pasa a neutro (no colorea la señal); para el volumen = silencio.
  // solo = si hay AL MENOS un efecto en solo, solo esos quedan activos; el resto va a neutro.
  // El volumen master nunca se silencia por el solo de otro (sigue siendo el nivel de salida),
  // pero sí puede mutearse aparte o ponerse en solo para escuchar la señal sin EQ/comp/estéreo.
  const [muted, setMuted] = useState({ eq: false, comp: false, stereo: false, volume: false });
  const [solo, setSolo]   = useState({ eq: false, comp: false, stereo: false, volume: false });

  // Decide si un efecto debe estar aplicando su procesado en este momento.
  const effectActive = (key) => {
    const anySolo = solo.eq || solo.comp || solo.stereo || solo.volume;
    return anySolo ? !!solo[key] : !muted[key];
  };

  const toggleMute = (key) => setMuted((m) => ({ ...m, [key]: !m[key] }));
  const toggleSolo = (key) => setSolo((s) => ({ ...s, [key]: !s[key] }));

  // --- Estado del propio procesador (activo / errores de captura) ---
  const [eqActive, setEqActive] = useState(false);
  const [eqError, setEqError] = useState('');
  const [iaMsg, setIaMsg] = useState('');   // aviso cuando la IA preconfigura el EQ

  // --- Perfiles de ecualización (cada test guardado = un perfil de dispositivo) ---
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(
    () => localStorage.getItem('dragonActiveTestId') || null
  );

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
  const bgRef = useRef(null);           // contenedor del fondo: recibe el "latido" (--beat) por CSS var

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

    // El fondo "late" con la música: pasamos la energía de graves como variable CSS.
    // Las brasas y el brillo del fondo la usan para reaccionar al ritmo.
    if (bgRef.current) bgRef.current.style.setProperty('--beat', bass.toFixed(3));

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


      //Esto es lo más impresionante de tu app. Conecta "cajitas" de sonido en cadena (como pedales de guitarra):
      // --- 1) Ecualizador gráfico de 9 bandas (1 BiquadFilter por banda) ---
      const filters = EQ_BANDS.map((band, i) => {
        const f = ctx.createBiquadFilter();
        f.type = band.type;
        f.frequency.value = band.freq;
        if (band.type === 'peaking') f.Q.value = 1.41; // ancho ≈ 1/2 octava
        f.gain.value = eqGains[i];//aqui  entra la IA con sus ganancias predecidas, o el usuario si las ajusta a mano. Si el efecto está en Mute, el gain se pone a 0 (curva plana); si está en Solo, se mantiene el valor pero los demás efectos se silencian.
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
      if (visualMode === 'full') {
        rafRef.current = requestAnimationFrame(drawVisualizer);
      }
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

    if (bgRef.current) bgRef.current.style.setProperty('--beat', '0');

    const canvas = canvasRef.current;
    if (canvas) {
      const cctx = canvas.getContext('2d');
      cctx.fillStyle = '#0c0503';
      cctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    setEqActive(false);
  };

  //La sincronización estado→audio es clave para que los controles sean responsivos sin reconstruir la cadena DSP:
  // --- Sincronización estado React → nodos Web Audio ---
  // Cada vez que el usuario mueve un slider (o pulsa ↺), propagamos el valor
  // directamente al nodo correspondiente, sin reconstruir la cadena.
  useEffect(() => {
    const on = effectActive('eq');                 // si está off → curva plana (0 dB)
    eqFiltersRef.current.forEach((f, i) => {
      if (f) f.gain.value = on ? eqGains[i] : 0;//mueve el filtro real según el estado del slider, o lo silencia si el efecto está en Mute o si otro efecto está en Solo. El solo de EQ no silencia el volumen master, para que puedas escuchar la diferencia entre con/sin EQ sin perder el nivel de salida.
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eqGains, muted, solo]);// se ejecuta cuando cambian las ganancias del EQ, o cuando se activa el Mute/Solo de cualquier efecto (porque el estado de los demás efectos afecta si este se aplica o no).
  useEffect(() => {
    const on = effectActive('comp');               // si está off → threshold 0 / ratio 1 (sin compresión)
    if (compressorRef.current) {
      compressorRef.current.threshold.value = on ? compThreshold : 0;
      compressorRef.current.ratio.value = on ? compRatio : 1;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compThreshold, compRatio, muted, solo]);
  useEffect(() => {
    const on = effectActive('stereo');             // si está off → pan centrado y ancho normal
    if (pannerRef.current) pannerRef.current.pan.value = on ? pan : 0;
    applyWidth(on ? width : 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pan, width, muted, solo]);
  useEffect(() => {
    // Rampa exponencial corta (~20 ms) para evitar clicks al saltar de volumen.
    // El volumen solo se silencia con su propio Mute; el solo de otros efectos no lo apaga.
    if (masterGainRef.current && audioCtxRef.current) {
      const target = muted.volume ? 0 : volume / 100;
      masterGainRef.current.gain.setTargetAtTime(target, audioCtxRef.current.currentTime, 0.02);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, muted]);


  // Trae la lista de perfiles del usuario (para poder cambiar entre ellos en vivo).
  const loadProfiles = async () => {
    try {
      const res = await axios.get(`${API}/tests`, authHeader());
      setProfiles(res.data);
    } catch (e) {
      setProfiles([]);   // sin sesión o backend caído: simplemente no hay perfiles
    }
  };

  // Aplica un perfil al EQ: pide su curva (invertida + IA encima) y la carga en
  // las 9 bandas. El useEffect de eqGains la propaga en vivo a los filtros, así
  // que se puede cambiar de perfil sin detener el procesador ni repetir el test.
  const applyProfile = async (id) => {
    if (!id) return;
    try {
      const res = await axios.get(`${API}/tests/${id}/eq`, authHeader());
      const g = res.data.gains;
      if (Array.isArray(g) && g.length === DEFAULTS.eqGains.length) {
        setEqGains(g.map(v => Math.round(v)));   // sliders enteros (-12..12)
        setActiveProfileId(String(id));
        localStorage.setItem('dragonActiveTestId', String(id));
        setIaMsg('🤖 EQ = curva invertida de tu test + ajuste de la IA. Puedes afinarlo a mano.');
      }
    } catch (e) {
      setIaMsg('');   // sin sesión / sin modelo: se queda como esté
    }
  };

  // Al montar: carga la lista de perfiles y aplica el activo (si venimos de un test).
  useEffect(() => {
    loadProfiles();
    const id = localStorage.getItem('dragonActiveTestId');
    if (id) applyProfile(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arranca o pausa el visualizador canvas cuando cambia el modo visual.
  useEffect(() => {
    if (!eqActive) return;
    if (visualMode === 'simple') {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    } else if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(drawVisualizer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualMode, eqActive]);

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
    background: 'rgba(232,195,106,0.08)',
    border: '1px solid rgba(232,195,106,0.35)',
    borderRadius: 4,
    padding: '0 6px',
    fontSize: 12,
    cursor: 'pointer',
    color: '#e8c36a',
    lineHeight: '18px',
  };

  // --- Botones Solo / Mute por efecto ---
  const toggleBtnBase = {
    width: 26,
    height: 22,
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    lineHeight: '20px',
    padding: 0,
    transition: 'all 0.15s',
  };
  const soloBtnStyle = (active) => ({
    ...toggleBtnBase,
    background: active ? '#f0ad4e' : 'rgba(240,173,78,0.10)',
    border: `1px solid ${active ? '#f0ad4e' : 'rgba(240,173,78,0.4)'}`,
    color: active ? '#1c0a0c' : '#f0ad4e',
    boxShadow: active ? '0 0 10px rgba(240,173,78,0.7)' : 'none',
  });
  const muteBtnStyle = (active) => ({
    ...toggleBtnBase,
    background: active ? '#dc3545' : 'rgba(220,53,69,0.10)',
    border: `1px solid ${active ? '#dc3545' : 'rgba(220,53,69,0.45)'}`,
    color: active ? '#fff' : '#ff6b6b',
    boxShadow: active ? '0 0 10px rgba(220,53,69,0.7)' : 'none',
  });

  // Par de botones S (solo) / M (mute) para la cabecera de cada efecto.
  const effectToggles = (key) => (
    <span style={{ display: 'flex', gap: 6 }}>
      <button
        type="button"
        onClick={() => toggleSolo(key)}
        title="Solo: escucha únicamente este efecto (omite los demás)"
        style={soloBtnStyle(solo[key])}
      >S</button>
      <button
        type="button"
        onClick={() => toggleMute(key)}
        title="Mute: omite este efecto"
        style={muteBtnStyle(muted[key])}
      >M</button>
    </span>
  );

  // Cabecera de sección: título + botones Solo/Mute alineados a la derecha.
  const effectHeader = (title, key) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
      <h3 style={{ ...sectionTitle, margin: 0 }}>{title}</h3>
      {effectToggles(key)}
    </div>
  );

  // Slider reutilizable. `defaultValue` es a dónde vuelve al pulsar el botón ↺.
  const slider = (label, value, setter, min, max, step = 1, unit = '', defaultValue = 0) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 13, color: '#f0e6d2', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span>{label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#e8c36a', minWidth: 48, textAlign: 'right', fontFamily: 'monospace' }}>{value}{unit}</span>
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

  const sectionStyle = {
    background: 'rgba(28,10,12,0.55)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
    border: '1px solid rgba(232,195,106,0.22)',
    boxShadow: '0 0 18px rgba(120,10,20,0.25), inset 0 0 30px rgba(0,0,0,0.4)',
  };
  const sectionTitle = { margin: '0 0 10px 0', fontSize: 14, color: '#e8c36a', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 };

  return (
    <div className={visualMode === 'full' ? 'dragon-bg' : 'dragon-simple'} ref={bgRef} style={{ '--beat': 0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&display=swap');
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dragonShift {
          0%, 100% { background-position: 0% 0%, 100% 100%, 0% 50%; }
          50%      { background-position: 100% 100%, 0% 0%, 100% 50%; }
        }
        @keyframes emberFloat {
          0%   { transform: translateY(0) scale(1);   opacity: 0; }
          15%  { opacity: 0.9; }
          100% { transform: translateY(-120vh) scale(0.4); opacity: 0; }
        }
        @keyframes dragonSway {
          0%, 100% { transform: translateX(-50%) rotate(-3deg); }
          50%      { transform: translateX(-50%) rotate(3deg); }
        }
        @keyframes titleGlow {
          0%, 100% { text-shadow: 0 0 10px rgba(232,195,106,0.5), 0 0 22px rgba(180,30,0,0.4); }
          50%      { text-shadow: 0 0 18px rgba(255,180,60,0.9), 0 0 40px rgba(220,40,0,0.7); }
        }
        .dragon-bg {
          min-height: 100vh;
          padding: 1px 0 40px;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 20% 15%, rgba(120,12,20,0.55) 0%, transparent 45%),
            radial-gradient(circle at 82% 80%, rgba(60,6,10,0.6) 0%, transparent 50%),
            linear-gradient(135deg, #0a0405 0%, #18080a 50%, #0a0405 100%);
          background-size: 200% 200%, 200% 200%, 200% 200%;
          animation: dragonShift 22s ease-in-out infinite;
          font-family: 'Cinzel', serif;
        }
        /* 龙 — dragón gigante, marca de agua que se mece muy lento detrás de todo. */
        .dragon-watermark {
          position: absolute;
          top: 6%;
          left: 50%;
          transform: translateX(-50%);
          font-size: 46vw;
          line-height: 1;
          color: rgba(232,195,106,0.04);
          pointer-events: none;
          user-select: none;
          z-index: 0;
          animation: dragonSway 16s ease-in-out infinite;
        }
        /* Brasas/chispas ascendentes (como las que lanza el dragón). */
        .ember {
          position: absolute;
          bottom: -10px;
          width: 4px; height: 4px;
          border-radius: 50%;
          background: radial-gradient(circle, #ffd27a 0%, #ff5a00 60%, transparent 70%);
          box-shadow: 0 0 8px rgba(255,120,0,0.8);
          pointer-events: none;
          z-index: 1;
          animation: emberFloat linear infinite;
          /* Brillan más fuerte cuanto más pegan los graves (--beat 0..1). */
          filter: brightness(calc(0.7 + var(--beat, 0) * 2.2));
        }
        /* Resplandor central que late con el bajo: crece y se enciende al ritmo. */
        .dragon-pulse {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none;
          z-index: 1;
          background: radial-gradient(circle at 50% 42%,
            rgba(255,90,0,0.55) 0%,
            rgba(180,20,0,0.28) 28%,
            transparent 60%);
          opacity: calc(var(--beat, 0) * 0.9);
          transform: scale(calc(1 + var(--beat, 0) * 0.5));
          transition: opacity 90ms linear, transform 90ms linear;
        }
        /* El dragón de fondo también se enciende suavemente con el ritmo. */
        .dragon-watermark {
          color: rgba(232,195,106, calc(0.04 + var(--beat, 0) * 0.12)) !important;
        }
        /* El título conserva su brillo base (titleGlow) y además PULSA con el bajo:
           drop-shadow no choca con la animación de text-shadow, así se suman. */
        .dragon-title {
          filter: drop-shadow(0 0 calc(var(--beat, 0) * 34px) rgba(255,150,30, calc(var(--beat, 0) * 0.95)));
          transform: scale(calc(1 + var(--beat, 0) * 0.05));
          transition: filter 90ms linear, transform 90ms linear;
        }
        /* El subtítulo rojo 龙之音 también late con el ritmo. */
        .dragon-sub {
          filter: drop-shadow(0 0 calc(var(--beat, 0) * 24px) rgba(200,30,20, calc(var(--beat, 0) * 0.95)));
          transform: scale(calc(1 + var(--beat, 0) * 0.04));
          transition: filter 90ms linear, transform 90ms linear;
        }
        .dragon-content { position: relative; z-index: 2; max-width: 820px; margin: 0 auto; padding: 0 16px; }

        /* ── Modo simple: sin animaciones, sin partículas, bajo consumo ── */
        .dragon-simple {
          min-height: 100vh;
          padding: 1px 0 40px;
          background: #0d0507;
          background-image:
            radial-gradient(circle at 50% 20%, rgba(100,10,16,0.45) 0%, transparent 55%),
            radial-gradient(circle at 80% 85%, rgba(40,5,8,0.5) 0%, transparent 45%);
          font-family: 'Cinzel', serif;
          color: #f0e6d2;
        }
        .dragon-simple .dragon-content { position: relative; z-index: 2; max-width: 820px; margin: 0 auto; padding: 0 16px; }
        .dragon-simple .dragon-title { animation: none !important; filter: none !important; transform: none !important; }
        .dragon-simple .dragon-sub   { animation: none !important; filter: none !important; transform: none !important; }
      `}</style>

      {visualMode === 'full' && (
        <>
          <div className="dragon-watermark">龙</div>
          <div className="dragon-pulse" />
          {[...Array(14)].map((_, i) => (
            <span key={i} className="ember" style={{
              left: `${(i * 7 + 4) % 100}%`,
              width:  `${2 + (i % 4)}px`,
              height: `${2 + (i % 4)}px`,
              animationDuration: `${7 + (i % 5) * 2}s`,
              animationDelay:    `${(i % 6) * 1.7}s`,
            }} />
          ))}
        </>
      )}
      {visualMode === 'simple' && (
        <div style={{
          position: 'absolute', top: '8%', left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '38vw', lineHeight: 1,
          color: 'rgba(232,195,106,0.03)',
          pointerEvents: 'none', userSelect: 'none', zIndex: 0,
        }}>龙</div>
      )}

      {user.name && (
        <div ref={menuRef} style={{ position: 'absolute', top: 16, right: 20, zIndex: 20 }}>
          {/* Indicador clickeable */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 8px', borderRadius: 8,
              fontSize: 12, letterSpacing: 0.8,
              color: 'rgba(184,155,106,0.80)',
              fontFamily: "'Cinzel', serif",
              transition: 'color 0.2s',
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#e8c36a',
              boxShadow: '0 0 6px rgba(232,195,106,0.7)',
            }} />
            {user.name}
            <span style={{
              fontSize: 8, opacity: 0.6,
              transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.25s',
              display: 'inline-block',
            }}>▼</span>
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
              width: 230,
              background: 'rgba(12, 5, 6, 0.97)',
              border: '1px solid rgba(232,195,106,0.22)',
              borderRadius: 12,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.65), 0 0 24px rgba(120,10,20,0.2)',
              overflow: 'hidden',
              animation: 'fadeSlideDown 0.2s ease',
            }}>
              {/* Info usuario */}
              <div style={{ padding: '18px 18px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(232,195,106,0.12)',
                  border: '1px solid rgba(232,195,106,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, fontWeight: 700, color: '#e8c36a',
                  fontFamily: "'Cinzel', serif",
                }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#f0e6d2', fontWeight: 700, fontFamily: "'Cinzel', serif", letterSpacing: 0.5 }}>
                    {user.name}
                  </p>
                  {user.email && (
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(184,155,106,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'sans-serif', letterSpacing: 0 }}>
                      {user.email}
                    </p>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'rgba(232,195,106,0.12)', margin: '0 14px' }} />

              {/* Botón logout */}
              <div style={{ padding: '10px 10px 12px' }}>
                <button
                  onClick={handleLogout}
                  style={{
                    width: '100%', padding: '9px 14px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'rgba(220,53,69,0.08)',
                    border: '1px solid rgba(220,53,69,0.22)',
                    borderRadius: 8, cursor: 'pointer',
                    color: '#ff6b6b', fontSize: 13, fontWeight: 600,
                    fontFamily: "'Cinzel', serif", letterSpacing: 0.5,
                    transition: 'background 0.2s, border-color 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,53,69,0.18)'; e.currentTarget.style.borderColor = 'rgba(220,53,69,0.5)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(220,53,69,0.08)'; e.currentTarget.style.borderColor = 'rgba(220,53,69,0.22)'; }}
                >
                  <span style={{ fontSize: 15 }}>⏏</span>
                  Cerrar Sesión
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="dragon-content">
        {/* Encabezado */}
        <header style={{ textAlign: 'center', padding: '34px 0 22px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <img
              src="/logo.png"
              alt="DragonAudio"
              style={{ width: 72, height: 72, objectFit: 'contain', filter: 'drop-shadow(0 0 14px rgba(232,195,106,0.65))' }}
            />
            <h1 className="dragon-title" style={{
              margin: 0,
              fontSize: 42,
              letterSpacing: 4,
              color: '#e8c36a',
              animation: 'titleGlow 4s ease-in-out infinite',
            }}>
              DRAGON AUDIO
            </h1>
          </div>
          <p className="dragon-sub" style={{ margin: '6px 0 0', fontSize: 18, color: '#c0392b', letterSpacing: 8, fontWeight: 700 }}>
            龙 之 音
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#b89b6a', letterSpacing: 1 }}>
            El sonido del dragón · Procesador de audio en vivo
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            <button
              onClick={toggleVisualMode}
              style={{
                padding: '6px 18px',
                background: visualMode === 'full' ? 'rgba(192,57,43,0.18)' : 'rgba(232,195,106,0.1)',
                border: `1px solid ${visualMode === 'full' ? 'rgba(192,57,43,0.45)' : 'rgba(232,195,106,0.35)'}`,
                borderRadius: 20,
                color: visualMode === 'full' ? '#e88a6a' : '#e8c36a',
                fontSize: 12,
                cursor: 'pointer',
                letterSpacing: 0.5,
                transition: 'all 0.2s',
                fontWeight: 600,
              }}
            >
              {visualMode === 'full' ? '⚡ Modo Simple' : '🐉 Modo Dragón'}
            </button>
            <button
              onClick={() => { localStorage.removeItem('dragonTestCompleted'); navigate('/test'); }}
              style={{
                padding: '6px 18px',
                background: 'rgba(28,10,12,0.55)',
                border: '1px solid rgba(232,195,106,0.2)',
                borderRadius: 20,
                color: '#8a7a60',
                fontSize: 12,
                cursor: 'pointer',
                letterSpacing: 0.5,
                transition: 'all 0.2s',
              }}
            >
              🔬 Recalibrar Parlantes
            </button>
          </div>
        </header>

      {/* --- Procesador DSP: EQ + compresor + estéreo + volumen master. --- */}
      <div style={{
        background: 'rgba(12,5,6,0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        padding: 20,
        borderRadius: 14,
        border: '1px solid rgba(232,195,106,0.25)',
        boxShadow: '0 0 40px rgba(120,10,20,0.35)',
      }}>
        <h2 style={{ marginTop: 0, color: '#e8c36a', letterSpacing: 1 }}>🎛️ Procesador de Audio</h2>

        {/* Visualizador: canvas animado en modo full, indicador estático en modo simple */}
        <canvas
          ref={canvasRef}
          width={760}
          height={200}
          style={{
            width: '100%', height: 200, borderRadius: 8,
            background: '#0c0503', marginBottom: 12, display: visualMode === 'full' ? 'block' : 'none',
          }}
        />
        {visualMode === 'simple' && (
          <div style={{
            height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(28,10,12,0.5)', borderRadius: 8, marginBottom: 12,
            border: '1px solid rgba(232,195,106,0.12)',
          }}>
            <span style={{ color: eqActive ? '#e8c36a' : '#4a3520', fontSize: 14, fontWeight: 600 }}>
              {eqActive ? '🎵 Procesando audio — modo optimizado activo' : '龙  Activa el procesador para comenzar'}
            </span>
          </div>
        )}

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
          {/* Perfiles: cambia entre dispositivos calibrados sin repetir el test. */}
          <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
            <h3 style={sectionTitle}>🎚️ Perfiles de tus dispositivos</h3>
            {profiles.length === 0 ? (
              <p style={{ fontSize: 12, color: '#8a7a60', margin: 0 }}>
                Aún no tienes perfiles. Pulsa 🔬 Recalibrar, haz el test y guárdalo para crear uno.
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {profiles.map((p) => {
                  const active = String(p.id) === String(activeProfileId);
                  return (
                    <button
                      key={p.id}
                      onClick={() => applyProfile(p.id)}
                      title={`Aplicar el EQ del perfil "${p.name}"`}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                        padding: '8px 12px', borderRadius: 8, cursor: 'pointer', minWidth: 130,
                        background: active ? 'linear-gradient(135deg, #7a1515, #c0392b)' : 'rgba(28,10,12,0.5)',
                        border: `1px solid ${active ? '#e8c36a' : 'rgba(232,195,106,0.25)'}`,
                        color: active ? '#fff' : '#c0a878',
                        boxShadow: active ? '0 0 14px rgba(232,195,106,0.35)' : 'none',
                        transition: 'all 0.15s', fontFamily: "'Cinzel', serif",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{active ? '🟢' : '🎯'} {p.name}</span>
                      <span style={{ fontSize: 10, opacity: 0.8 }}>{new Date(p.updated_at).toLocaleString()}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* EQ gráfico — 9 sliders verticales en fila, estilo ecualizador hardware clásico. */}
          <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
            {effectHeader('Ecualizador (9 bandas)', 'eq')}
            <div style={{ opacity: effectActive('eq') ? 1 : 0.4, transition: 'opacity 0.2s' }}>
            {iaMsg && <p style={{ fontSize: 12, color: '#7bd88f', margin: '0 0 10px' }}>{iaMsg}</p>}
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
          </div>

          {/* Compresor — control de dinámica (aplasta picos sobre threshold). */}
          <div style={sectionStyle}>
            {effectHeader('Compresor', 'comp')}
            <div style={{ opacity: effectActive('comp') ? 1 : 0.4, transition: 'opacity 0.2s' }}>
            {slider('Threshold', compThreshold, setCompThreshold, -60, 0, 1, ' dB', DEFAULTS.compThreshold)}
            {slider('Ratio', compRatio, setCompRatio, 1, 20, 0.5, ':1', DEFAULTS.compRatio)}
            <p style={{ fontSize: 11, color: '#888', margin: 0 }}>
              Threshold más bajo = comprime más. Ratio alto = aplasta los picos.
            </p>
            </div>
          </div>

          {/* Estéreo — paneo (balance L/R) y ancho de imagen estéreo. */}
          <div style={sectionStyle}>
            {effectHeader('Estéreo', 'stereo')}
            <div style={{ opacity: effectActive('stereo') ? 1 : 0.4, transition: 'opacity 0.2s' }}>
            {slider('Paneo (L ← → R)', pan, setPan, -1, 1, 0.01, '', DEFAULTS.pan)}
            {slider('Ancho estéreo (0=mono · 1=normal · 2=amplio)', width, setWidth, 0, 2, 0.01, '', DEFAULTS.width)}
            </div>
          </div>

          {/* Volumen master — ganancia final + avisos de seguridad auditiva. */}
          <div
            style={{
              ...sectionStyle,
              gridColumn: '1 / -1',
              borderColor:
                volume > 300 ? '#dc3545' : volume > 100 ? '#f0ad4e' : 'rgba(232,195,106,0.22)',
            }}
          >
            {effectHeader('Volumen master', 'volume')}
            {muted.volume && (
              <p style={{ fontSize: 12, color: '#ff6b6b', margin: '0 0 10px', fontWeight: 600 }}>
                🔇 Silenciado (Mute activo) — no sale audio aunque subas el volumen.
              </p>
            )}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: '#f0e6d2', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>Volumen (100 = original · 600 = amplificado x6)</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      color:
                        volume > 300 ? '#ff6b6b' : volume > 100 ? '#f0ad4e' : '#e8c36a',
                      fontWeight: volume > 100 ? 'bold' : 'normal',
                      fontFamily: 'monospace',
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

        <ul style={{ fontSize: 12, color: '#b89b6a', paddingLeft: 18, marginTop: 12 }}>
          <li>Funciona en Chrome, Edge y Brave. No en Firefox ni Safari.</li>
          <li>
            En el diálogo elige <b style={{ color: '#e8c36a' }}>"Pestaña de Chrome"</b>, selecciona la pestaña con tu música y activa <b style={{ color: '#e8c36a' }}>"Compartir audio de la pestaña"</b>.
          </li>
          <li>
            El dragón reproduce su propia versión filtrada del audio: baja el volumen de la pestaña original para no oír las dos a la vez.
          </li>
        </ul>
      </div>
      </div>
    </div>
  );
}
