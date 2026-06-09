import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import API from '../api';

// Header con el token JWT que guardó el login. El backend saca de ahí el usuario.
const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });

// 11 frecuencias clave, cada una etiquetada con su categoría auditiva (cat).
const BANDS = [
  { hz: 40,    label: '40 Hz',  cat: 'Subgraves',       icon: '💣', color: '#9B59B6' },
  { hz: 80,    label: '80 Hz',  cat: 'Graves',          icon: '🐘', color: '#7D3C98' },
  { hz: 125,   label: '125 Hz', cat: 'Graves',          icon: '🥁', color: '#2980B9' },
  { hz: 250,   label: '250 Hz', cat: 'Medios graves',   icon: '🎸', color: '#1A5276' },
  { hz: 500,   label: '500 Hz', cat: 'Medios',          icon: '🎹', color: '#1E8449' },
  { hz: 1000,  label: '1 kHz',  cat: 'Medios para voz', icon: '🎤', color: '#D4AC0D' },
  { hz: 2000,  label: '2 kHz',  cat: 'Medios para voz', icon: '🎵', color: '#CA6F1E' },
  { hz: 4000,  label: '4 kHz',  cat: 'Presencia',       icon: '🔔', color: '#A93226' },
  { hz: 8000,  label: '8 kHz',  cat: 'Agudos',          icon: '🎷', color: '#C0392B' },
  { hz: 12000, label: '12 kHz', cat: 'Brillo',          icon: '✨', color: '#117A65' },
  { hz: 16000, label: '16 kHz', cat: 'Brillo',          icon: '⭐', color: '#0E6251' },
];

// Orden de las categorías auditivas (para agrupar los resultados).
const CATEGORIES = ['Subgraves', 'Graves', 'Medios graves', 'Medios', 'Medios para voz', 'Presencia', 'Agudos', 'Brillo'];

// Ganancia MÁXIMA por frecuencia (fader al 100%). El fader escala sobre esto con
// curva cuadrática para dar control fino justo en los volúmenes bajos (el umbral).
const GAIN = { 40:0.9, 80:0.8, 125:0.7, 250:0.55, 500:0.42, 1000:0.35, 2000:0.3, 4000:0.27, 8000:0.3, 12000:0.35, 16000:0.42 };

// "Facilidad de detección" (0-100) a partir del umbral del fader: umbral BAJO =
// se oye con poco volumen = se detecta fácil = valor ALTO. Compatible con tests
// viejos que solo guardaban `score` (claridad 0-10).
const easeOf = r => r.threshold != null ? (100 - r.threshold) : (r.score != null ? r.score * 10 : 0);

// Convierte puntos en una curva SUAVE (Catmull-Rom -> Bézier), estilo analizador.
function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0].x},${pts[0].y}` : '';
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

// Mapa de percepción estilo espectrómetro / analizador (tipo Pro-Q): fondo oscuro
// degradado, rejilla de frecuencias, curva suave con relleno degradado + glow y
// nodos luminosos. Altura del punto = volumen del fader: MÁS volumen = MÁS abajo,
// MENOS volumen = MÁS arriba. Con margen superior para que el pico no toque el borde.
function FreqGraph({ results }) {
  const W = 600, H = 280;
  const P = { t: 30, r: 16, b: 46, l: 16 };
  const iW = W - P.l - P.r;
  const iH = H - P.t - P.b;
  const base = P.t + iH;
  const headroom = 26;                          // margen superior: el pico nunca toca el borde
  const logMin = Math.log10(20), logMax = Math.log10(22000);
  const xOf = hz => P.l + ((Math.log10(hz) - logMin) / (logMax - logMin)) * iW;
  // e = easeOf (0-100): 100 = poco volumen (arriba), 0 = mucho volumen (abajo).
  const yOf = e => base - (e / 100) * (iH - headroom);

  const pts = results.map(r => ({ x: xOf(r.hz), y: yOf(easeOf(r)), color: r.color }));
  const curve = smoothPath(pts);
  const area = pts.length ? `${curve} L${pts[pts.length-1].x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z` : '';

  const gridF = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const fLabel = hz => hz >= 1000 ? `${hz / 1000}k` : `${hz}`;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="fqFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#e8c36a" stopOpacity="0.55" />
          <stop offset="45%"  stopColor="#c0392b" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#c0392b" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="fqLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#9B59B6" />
          <stop offset="48%"  stopColor="#e8c36a" />
          <stop offset="100%" stopColor="#C0392B" />
        </linearGradient>
        <linearGradient id="fqBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#170a0c" />
          <stop offset="100%" stopColor="#070405" />
        </linearGradient>
        <filter id="fqGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Fondo */}
      <rect x={P.l} y={P.t} width={iW} height={iH} rx="8" fill="url(#fqBg)" stroke="rgba(232,195,106,0.16)" />

      {/* Rejilla horizontal */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <line key={`r${t}`} x1={P.l} y1={base - t * iH} x2={W - P.r} y2={base - t * iH}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      {/* Rejilla vertical + etiquetas de frecuencia */}
      {gridF.map(hz => (
        <g key={`g${hz}`}>
          <line x1={xOf(hz)} y1={P.t} x2={xOf(hz)} y2={base} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <text x={xOf(hz)} y={base + 15} textAnchor="middle" fontSize="9" fill="#6a5a44">{fLabel(hz)}</text>
        </g>
      ))}

      {/* Etiquetas de zona */}
      <text x={(xOf(20) + xOf(250)) / 2}    y={P.t + 13} textAnchor="middle" fontSize="8" letterSpacing="1.5" fill="rgba(155,89,182,0.7)">GRAVES</text>
      <text x={(xOf(250) + xOf(4000)) / 2}  y={P.t + 13} textAnchor="middle" fontSize="8" letterSpacing="1.5" fill="rgba(232,195,106,0.7)">MEDIOS</text>
      <text x={(xOf(4000) + xOf(22000)) / 2} y={P.t + 13} textAnchor="middle" fontSize="8" letterSpacing="1.5" fill="rgba(192,57,43,0.85)">AGUDOS</text>

      {/* Relleno + curva con glow */}
      {area && <path d={area} fill="url(#fqFill)" />}
      {curve && <path d={curve} fill="none" stroke="url(#fqLine)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" filter="url(#fqGlow)" />}

      {/* Nodos luminosos */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="7"   fill={p.color} opacity="0.28" filter="url(#fqGlow)" />
          <circle cx={p.x} cy={p.y} r="4.5" fill={p.color} stroke="#fff" strokeWidth="1.3" />
        </g>
      ))}

      {/* Pie */}
      <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="#554540">
        Frecuencia (Hz) · arriba = se detecta fácil · abajo = necesita más volumen
      </text>
    </svg>
  );
}

const DRAGON_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&display=swap');
  @keyframes dragonShift {
    0%, 100% { background-position: 0% 0%, 100% 100%, 0% 50%; }
    50%      { background-position: 100% 100%, 0% 0%, 100% 50%; }
  }
  @keyframes emberFloat {
    0%   { transform: translateY(0) scale(1);   opacity: 0; }
    15%  { opacity: 0.8; }
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
  @keyframes waveBar {
    0%, 100% { transform: scaleY(0.25); }
    50%      { transform: scaleY(1); }
  }
  @keyframes pulseGlow {
    0%, 100% { opacity: 0.35; transform: scale(1); }
    50%      { opacity: 0.6;  transform: scale(1.04); }
  }
  .at-bg {
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
    color: #f0e6d2;
    box-sizing: border-box;
  }
  .at-watermark {
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
  .at-ember {
    position: absolute;
    bottom: -10px;
    border-radius: 50%;
    background: radial-gradient(circle, #ffd27a 0%, #ff5a00 60%, transparent 70%);
    box-shadow: 0 0 8px rgba(255,120,0,0.8);
    pointer-events: none;
    z-index: 1;
    animation: emberFloat linear infinite;
    filter: brightness(0.75);
  }
  .at-pulse {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: radial-gradient(circle at 50% 40%,
      rgba(255,80,0,0.14) 0%,
      rgba(160,20,0,0.07) 30%,
      transparent 62%);
    animation: pulseGlow 5s ease-in-out infinite;
  }
  .at-content {
    position: relative;
    z-index: 2;
    max-width: 560px;
    margin: 0 auto;
    padding: 0 16px;
  }
  .at-header {
    text-align: center;
    padding: 28px 0 18px;
  }
  .at-title {
    margin: 0;
    font-size: 34px;
    letter-spacing: 4px;
    color: #e8c36a;
    animation: titleGlow 4s ease-in-out infinite;
  }
  .at-sub {
    margin: 5px 0 0;
    font-size: 15px;
    color: #c0392b;
    letter-spacing: 8px;
    font-weight: 700;
  }
  .at-card {
    background: rgba(28,10,12,0.6);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1px solid rgba(232,195,106,0.2);
    border-radius: 14px;
    padding: 20px;
    margin-bottom: 12px;
    box-shadow: 0 0 18px rgba(100,8,16,0.3), inset 0 0 24px rgba(0,0,0,0.3);
  }
  .at-btn-primary {
    width: 100%;
    padding: 15px 0;
    border-radius: 12px;
    border: 1px solid rgba(232,195,106,0.35);
    background: linear-gradient(135deg, #7a1515, #c0392b);
    color: #f0e6d2;
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: all 0.2s;
    box-shadow: 0 0 22px rgba(192,57,43,0.35);
  }
  .at-btn-primary:hover {
    background: linear-gradient(135deg, #c0392b, #e74c3c);
    box-shadow: 0 0 32px rgba(192,57,43,0.55);
  }
  .at-btn-enter {
    width: 100%;
    padding: 16px 0;
    border-radius: 12px;
    border: 1px solid rgba(232,195,106,0.5);
    background: linear-gradient(135deg, #c0392b, #e8c36a);
    color: #fff;
    font-size: 17px;
    font-weight: 900;
    cursor: pointer;
    letter-spacing: 0.8px;
    margin-bottom: 10px;
    box-shadow: 0 0 30px rgba(192,57,43,0.45);
    transition: all 0.2s;
  }
  .at-btn-enter:hover {
    box-shadow: 0 0 45px rgba(232,195,106,0.5);
    transform: translateY(-1px);
  }
  .at-btn-ghost {
    width: 100%;
    padding: 12px 0;
    border-radius: 12px;
    border: 1px solid rgba(232,195,106,0.18);
    background: rgba(28,10,12,0.4);
    color: #8a7a60;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 24px;
  }
  .at-btn-ghost:hover {
    border-color: rgba(232,195,106,0.4);
    color: #e8c36a;
  }
`;

export default function AudioTest() {
  const navigate = useNavigate();
  const [phase,         setPhase]         = useState('intro');
  const [current,       setCurrent]       = useState(0);
  const [results,       setResults]       = useState([]);
  const [playing,       setPlaying]       = useState(false);
  const [hasPlayed,     setHasPlayed]     = useState(false);
  const [faderValue,    setFaderValue]    = useState(0);   // 0-100: posición del fader (umbral mínimo audible)
  const audioCtxRef = useRef(null);
  const oscRef      = useRef(null);
  const gainRef     = useRef(null);

  // --- Tests guardados (Postgres vía backend) ---
  const [savedTests,   setSavedTests]   = useState([]);   // lista resumida del usuario
  const [loadedTestId, setLoadedTestId] = useState(null); // id si estamos editando uno; null = nuevo
  const [testName,     setTestName]     = useState('');   // nombre libre que pone el usuario
  const [apiMsg,       setApiMsg]       = useState('');   // feedback de guardado/errores

  const getCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  // fader 0-100 -> ganancia real. Curva cuadrática: control fino en volúmenes bajos.
  const faderToGain = (f, hz) => Math.pow(f / 100, 2) * GAIN[hz];

  const stopTone = () => {
    if (oscRef.current) {
      try { oscRef.current.stop(); } catch(e) {}
      oscRef.current = null;
    }
    gainRef.current = null;
    setPlaying(false);
  };

  // Arranca un tono CONTINUO en la frecuencia actual, con el volumen del fader.
  const startTone = () => {
    stopTone();
    const ctx  = getCtx();
    const freq = BANDS[current].hz;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(faderToGain(faderValue, freq), ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    oscRef.current  = osc;
    gainRef.current = gain;
    setPlaying(true);
    setHasPlayed(true);
  };

  // Mueve el fader: actualiza el volumen del tono en vivo (si está sonando).
  const onFader = (v) => {
    setFaderValue(v);
    const ctx = audioCtxRef.current;
    if (gainRef.current && ctx) {
      gainRef.current.gain.setTargetAtTime(faderToGain(v, BANDS[current].hz), ctx.currentTime, 0.02);
    }
  };

  const handleNext = () => {
    if (!hasPlayed || faderValue <= 0) return;
    stopTone();
    const b = BANDS[current];
    // Guardamos el umbral crudo (fader 0-100) y derivamos un score 0-10 para la IA
    // del EQ: umbral bajo (se oye fácil) -> score alto (poca corrección).
    const score = Math.round((1 - faderValue / 100) * 100) / 10;
    const newResults = [...results, { hz: b.hz, label: b.label, icon: b.icon, color: b.color, cat: b.cat, threshold: faderValue, score }];
    setResults(newResults);
    setFaderValue(0);
    setHasPlayed(false);
    if (current < BANDS.length - 1) {
      setCurrent(c => c + 1);
    } else {
      setPhase('results');
    }
  };

  const restart = () => {
    stopTone();
    setPhase('intro');
    setCurrent(0);
    setResults([]);
    setHasPlayed(false);
    setFaderValue(0);
    setLoadedTestId(null);
    setTestName('');
    setApiMsg('');
  };

  const enterPlayer = () => {
    localStorage.setItem('dragonTestCompleted', '1');
    // Si el test está guardado, dejamos su id para que el reproductor pida su EQ a la IA.
    if (loadedTestId) localStorage.setItem('dragonActiveTestId', String(loadedTestId));
    else localStorage.removeItem('dragonActiveTestId');
    navigate('/music');
  };

  // Trae los tests del usuario al abrir la pantalla (si hay sesión).
  const loadSavedTests = async () => {
    try {
      const res = await axios.get(`${API}/tests`, authHeader());
      setSavedTests(res.data);
    } catch (e) {
      setSavedTests([]); // sin sesión o backend caído: simplemente no hay lista
    }
  };
  useEffect(() => { loadSavedTests(); }, []);

  // Empieza un test NUEVO (limpia cualquier test cargado previamente).
  const startNew = () => {
    stopTone();
    setLoadedTestId(null);
    setTestName('');
    setResults([]);
    setCurrent(0);
    setFaderValue(0);
    setHasPlayed(false);
    setApiMsg('');
    setPhase('testing');
  };

  // Guarda (POST) o sobrescribe (PUT) el test actual en la cuenta del usuario. esto sirve para que el reproductor pueda pedirle a la IA el EQ recomendado basado en este test guardado. Si no hay sesión, muestra error (no se puede guardar sin cuenta). Si ya se guardó antes, hace PUT para actualizarlo; si es nuevo, hace POST y guarda el id que devuelve el backend para futuras ediciones.
  const persist = async () => {
    setApiMsg('');
    const payload = { name: testName.trim() || 'Test sin nombre', results };
    try {
      if (loadedTestId) {
        await axios.put(`${API}/tests/${loadedTestId}`, payload, authHeader());
        setApiMsg('✓ Test actualizado');
      } else {
        const res = await axios.post(`${API}/tests`, payload, authHeader());
        setLoadedTestId(res.data.id);
        setApiMsg('✓ Test guardado');
      }
      loadSavedTests();
    } catch (e) {
      setApiMsg(e.response?.status === 401 ? '⚠ Inicia sesión para guardar' : '⚠ Error al guardar');
    }
  };

  // Carga un test guardado y muestra sus resultados (listo para ver/editar).
  const loadTest = async (id) => {
    try {
      const res = await axios.get(`${API}/tests/${id}`, authHeader());
      setResults(res.data.results || []);
      setTestName(res.data.name);
      setLoadedTestId(res.data.id);
      setApiMsg('');
      setPhase('results');
    } catch (e) {
      setApiMsg('⚠ No se pudo cargar el test');
    }
  };

  const renameTest = async (id, currentName) => {
    const name = window.prompt('Nuevo nombre del test:', currentName);
    if (name == null) return;
    try {
      await axios.put(`${API}/tests/${id}`, { name }, authHeader());
      if (id === loadedTestId) setTestName(name);
      loadSavedTests();
    } catch (e) { setApiMsg('⚠ No se pudo renombrar'); }
  };

  const removeTest = async (id) => {
    if (!window.confirm('¿Borrar este test? No se puede deshacer.')) return;
    try {
      await axios.delete(`${API}/tests/${id}`, authHeader());
      if (id === loadedTestId) setLoadedTestId(null);
      loadSavedTests();
    } catch (e) { setApiMsg('⚠ No se pudo borrar'); }
  };

  const b = BANDS[current];
  const progress = (current / BANDS.length) * 100;

  const embers = [...Array(14)].map((_, i) => (
    <span key={i} className="at-ember" style={{
      left: `${(i * 7 + 4) % 100}%`,
      width:  `${2 + (i % 4)}px`,
      height: `${2 + (i % 4)}px`,
      animationDuration: `${7 + (i % 5) * 2}s`,
      animationDelay:    `${(i % 6) * 1.7}s`,
    }} />
  ));

  const phaseSubtitle = {
    intro:   'Calibración de Parlantes · Diagnóstico de Frecuencias',
    testing: `Frecuencia ${current + 1} de ${BANDS.length} · Calibrando...`,
    results: 'Diagnóstico Completado',
  }[phase];

  return (
    <div className="at-bg">
      <style>{DRAGON_CSS}</style>
      <div className="at-watermark">龙</div>
      <div className="at-pulse" />
      {embers}

      <div className="at-content">
        {/* Header común */}
        <div className="at-header">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <img
              src="/logo.png"
              alt="DragonAudio"
              style={{ width: 72, height: 72, objectFit: 'contain', filter: 'drop-shadow(0 0 14px rgba(232,195,106,0.65))' }}
            />
            <h1 className="at-title">DRAGON AUDIO</h1>
          </div>
          <p className="at-sub">龙 之 音</p>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: '#8a7a60', letterSpacing: 0.8 }}>{phaseSubtitle}</p>
        </div>

        {/* ── INTRO ── */}
        {phase === 'intro' && (
          <>
            <div className="at-card" style={{ borderColor: 'rgba(192,57,43,0.35)' }}>
              <h3 style={{ margin: '0 0 12px', color: '#e8c36a', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5 }}>🎯 ¿Qué descubrirás?</h3>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 2, color: '#c0a878', fontSize: 14 }}>
                <li>Cómo responden tus parlantes en <strong style={{ color: '#f0e6d2' }}>11 frecuencias clave</strong></li>
                <li>Tu <strong style={{ color: '#f0e6d2' }}>mapa de percepción de frecuencias</strong> personalizado</li>
                <li>Las frecuencias agrupadas por <strong style={{ color: '#f0e6d2' }}>categorías auditivas</strong></li>
                <li>Qué rangos detecta tu dispositivo con mayor o menor facilidad</li>
              </ul>
            </div>

            <div className="at-card">
              <h3 style={{ margin: '0 0 12px', color: '#8a7a60', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5 }}>📋 Cómo hacer la prueba</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: '10px 8px', fontSize: 14, color: '#c0a878', alignItems: 'start' }}>
                <span style={{ color: '#e8c36a', fontWeight: 700 }}>1.</span>
                <span>Ajusta el <strong style={{ color: '#f0e6d2' }}>volumen al 60-70%</strong> antes de comenzar</span>
                <span style={{ color: '#e8c36a', fontWeight: 700 }}>2.</span>
                <span>Usa <strong style={{ color: '#f0e6d2' }}>auriculares o parlantes externos</strong> para mayor precisión</span>
                <span style={{ color: '#e8c36a', fontWeight: 700 }}>3.</span>
                <span>Sube el <strong style={{ color: '#f0e6d2' }}>fader lentamente</strong> hasta que <strong style={{ color: '#f0e6d2' }}>apenas</strong> escuches cada tono y déjalo ahí</span>
                <span style={{ color: '#e8c36a', fontWeight: 700 }}>4.</span>
                <span>Hazlo en un <strong style={{ color: '#f0e6d2' }}>lugar tranquilo</strong> para mayor precisión</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 7, marginBottom: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
              {['11 frecuencias', '~3 minutos', 'Fader de volumen', 'Mapa de percepción', 'Por categorías'].map(tag => (
                <span key={tag} style={{
                  background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(232,195,106,0.18)',
                  borderRadius: 20, padding: '4px 12px', fontSize: 12, color: '#8a7a60',
                }}>{tag}</span>
              ))}
            </div>

            {savedTests.length > 0 && (
              <div className="at-card">
                <h3 style={{ margin: '0 0 12px', color: '#e8c36a', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5 }}>📁 Tus tests guardados</h3>
                {savedTests.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6,
                    background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(232,195,106,0.15)',
                  }}>
                    <button
                      onClick={() => loadTest(t.id)}
                      title="Cargar este test"
                      style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: '#f0e6d2', cursor: 'pointer', fontSize: 14 }}
                    >
                      🎯 {t.name}
                      <span style={{ display: 'block', fontSize: 11, color: '#6a5a40' }}>
                        {new Date(t.updated_at).toLocaleString()}
                      </span>
                    </button>
                    <button onClick={() => renameTest(t.id, t.name)} title="Renombrar"
                      style={{ background: 'rgba(232,195,106,0.08)', border: '1px solid rgba(232,195,106,0.3)', borderRadius: 6, color: '#e8c36a', cursor: 'pointer', padding: '4px 8px' }}>✏️</button>
                    <button onClick={() => removeTest(t.id)} title="Borrar"
                      style={{ background: 'rgba(192,57,43,0.12)', border: '1px solid rgba(192,57,43,0.4)', borderRadius: 6, color: '#e88a6a', cursor: 'pointer', padding: '4px 8px' }}>🗑️</button>
                  </div>
                ))}
                {apiMsg && <p style={{ fontSize: 12, color: '#e8c36a', margin: '6px 0 0' }}>{apiMsg}</p>}
              </div>
            )}

            <button className="at-btn-primary" onClick={startNew}>
              🐉 Hacer un Test Nuevo
            </button>
          </>
        )}

        {/* ── TESTING ── */}
        {phase === 'testing' && (
          <>
            {/* Barra de progreso */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#8a7a60' }}>Frecuencia {current + 1} de {BANDS.length}</span>
                <span style={{ fontSize: 12, color: '#8a7a60' }}>{Math.round(progress)}% completado</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, ${b.color}, #e8c36a)`,
                  borderRadius: 2,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>

            {/* Tarjeta de frecuencia */}
            <div className="at-card" style={{ borderColor: `${b.color}55`, background: `${b.color}0d`, textAlign: 'center', paddingBottom: 16 }}>
              <div style={{ fontSize: 42, marginBottom: 6 }}>{b.icon}</div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2.5, color: b.color, marginBottom: 4, fontWeight: 600 }}>{b.cat}</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#f0e6d2', letterSpacing: -1 }}>{b.label}</div>
              <div style={{ fontSize: 13, color: '#7a6a50', marginTop: 4 }}>Sube el fader hasta que <strong style={{ color: '#c0a878' }}>apenas</strong> empieces a oírlo</div>

              {/* Visualizador de onda */}
              <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12 }}>
                {[0.4,0.7,1,0.8,1,0.9,0.5,0.8,1,0.7,0.4].map((h, i) =>
                  playing ? (
                    <div key={i} style={{
                      width: 4, height: `${h * 28}px`, borderRadius: 2, backgroundColor: b.color,
                      animation: `waveBar ${0.35 + i*0.05}s ease-in-out infinite`,
                      animationDelay: `${i * 0.04}s`,
                      transformOrigin: 'center',
                    }} />
                  ) : (
                    <div key={i} style={{
                      width: 4, height: `${h * 7}px`, borderRadius: 2,
                      backgroundColor: hasPlayed ? `${b.color}66` : 'rgba(255,255,255,0.07)',
                    }} />
                  )
                )}
              </div>
              {!playing && hasPlayed && (
                <div style={{ fontSize: 12, color: '#7a6a50', marginTop: 5 }}>Tono pausado — reanúdalo si lo necesitas</div>
              )}
            </div>

            {/* Botón reproducir / pausar (tono continuo) */}
            <button
              onClick={playing ? stopTone : startTone}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                background: playing ? 'rgba(255,255,255,0.06)' : b.color,
                color: playing ? '#e8c36a' : '#fff',
                fontSize: 15, fontWeight: 700, cursor: 'pointer',
                marginBottom: 12, transition: 'background 0.2s',
              }}
            >
              {playing ? '⏸ Pausar Tono' : hasPlayed ? '▶ Reanudar Tono' : '▶ Reproducir Tono'}
            </button>

            {/* Fader de volumen: el usuario sube hasta el umbral mínimo audible */}
            <div className="at-card" style={{ marginBottom: 12 }}>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: hasPlayed ? '#f0e6d2' : '#3a2a18' }}>
                  {hasPlayed ? 'Sube el volumen lentamente' : '▶ Primero reproduce el tono'}
                </p>
                {hasPlayed && (
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#7a6a50' }}>
                    Detente justo cuando empieces a oírlo y deja el fader ahí
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 16 }}>🔈</span>
                <input
                  type="range" min="0" max="100" step="1" value={faderValue}
                  disabled={!hasPlayed}
                  onChange={e => onFader(Number(e.target.value))}
                  style={{ flex: 1, accentColor: b.color, cursor: hasPlayed ? 'pointer' : 'default' }}
                />
                <span style={{ fontSize: 16 }}>🔊</span>
                <span style={{ minWidth: 34, textAlign: 'right', fontWeight: 800, fontSize: 15, color: faderValue > 0 ? '#e8c36a' : '#3a2a18' }}>
                  {faderValue}
                </span>
              </div>

              {hasPlayed && faderValue > 0 && (
                <div style={{
                  marginTop: 12, padding: '8px 14px', textAlign: 'center',
                  background: 'rgba(192,57,43,0.14)', borderRadius: 8,
                  border: '1px solid rgba(232,195,106,0.22)',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e8c36a' }}>
                    Umbral marcado en {faderValue}/100 — avanza cuando lo dejes en el punto justo
                  </span>
                </div>
              )}
            </div>

            {/* Siguiente */}
            <button
              onClick={handleNext}
              disabled={!(hasPlayed && faderValue > 0)}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12,
                border: (hasPlayed && faderValue > 0) ? '1px solid rgba(232,195,106,0.35)' : 'none',
                background: (hasPlayed && faderValue > 0)
                  ? 'linear-gradient(135deg, #7a1515, #c0392b)'
                  : 'rgba(255,255,255,0.04)',
                color: (hasPlayed && faderValue > 0) ? '#f0e6d2' : '#2e1e0e',
                fontSize: 15, fontWeight: 700,
                cursor: (hasPlayed && faderValue > 0) ? 'pointer' : 'default',
                transition: 'all 0.2s',
                boxShadow: (hasPlayed && faderValue > 0) ? '0 0 20px rgba(192,57,43,0.3)' : 'none',
              }}
            >
              {current < BANDS.length - 1 ? 'Siguiente Frecuencia →' : '🎯 Ver mis Resultados'}
            </button>

            {/* Puntos de progreso */}
            <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              {BANDS.map((band, i) => (
                <div key={i} style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: i < current ? band.color : i === current ? '#e8c36a' : 'rgba(255,255,255,0.07)',
                  transition: 'all 0.3s',
                }} />
              ))}
            </div>
          </>
        )}

        {/* ── RESULTS ── */}
        {phase === 'results' && (() => {
          // Agrupamos por categoría auditiva, en el orden definido.
          const groups = CATEGORIES
            .map(cat => ({ cat, items: results.filter(r => (r.cat || '') === cat) }))
            .filter(g => g.items.length);
          return (
            <>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 30, marginBottom: 4 }}>🗺️</div>
                <h2 style={{ margin: 0, fontSize: 19, color: '#f0e6d2' }}>Mapa de Percepción</h2>
                <p style={{ margin: '3px 0 0', color: '#6a5a40', fontSize: 13 }}>Qué rangos detecta tu dispositivo con mayor o menor facilidad</p>
              </div>

              <div className="at-card" style={{ padding: '14px 8px' }}>
                <FreqGraph results={results} />
              </div>

              <div className="at-card">
                <h3 style={{ margin: '0 0 14px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: '#6a5a40' }}>Por categoría auditiva</h3>
                {groups.map(g => {
                  const gEase = g.items.reduce((s, r) => s + easeOf(r), 0) / g.items.length;
                  const rel = gEase / 100;                  // 0..1 absoluto (más volumen = barra más corta)
                  const col = g.items[0].color;
                  return (
                    <div key={g.cat} style={{ marginBottom: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#c0a878', fontWeight: 600 }}>{g.cat}</span>
                        <span style={{ fontSize: 11, color: '#6a5a40' }}>{g.items.map(r => r.label).join(' · ')}</span>
                      </div>
                      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(6, rel * 100)}%`, background: `linear-gradient(90deg, ${col}, #e8c36a)`, borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })}
                <p style={{ fontSize: 11, color: '#6a5a40', margin: '6px 0 0', textAlign: 'center' }}>◀ menor detección&nbsp;·&nbsp;mayor detección ▶</p>
              </div>

              {/* Guardar / actualizar el test en la cuenta del usuario */}
              <div className="at-card">
                <h3 style={{ margin: '0 0 10px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: '#6a5a40' }}>
                  💾 {loadedTestId ? 'Actualizar este test' : 'Guardar este test'}
                </h3>
                <input
                  type="text"
                  value={testName}
                  onChange={e => setTestName(e.target.value)}
                  placeholder="Nombre del test (ej: Parlantes sala, Audífonos Sony...)"
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '11px 12px', marginBottom: 10,
                    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(232,195,106,0.3)',
                    borderRadius: 8, color: '#f0e6d2', fontSize: 14,
                  }}
                />
                <button className="at-btn-primary" onClick={persist}>
                  {loadedTestId ? '💾 Guardar cambios' : '💾 Guardar test'}
                </button>
                {apiMsg && <p style={{ fontSize: 13, color: '#e8c36a', margin: '10px 0 0', textAlign: 'center' }}>{apiMsg}</p>}
              </div>

              <button className="at-btn-enter" onClick={enterPlayer}>
                🐉 Entrar a Dragon Audio →
              </button>
              <button className="at-btn-ghost" onClick={restart}>
                ↺ Repetir Calibración
              </button>
            </>
          );
        })()}
      </div>
    </div>
  );
}
