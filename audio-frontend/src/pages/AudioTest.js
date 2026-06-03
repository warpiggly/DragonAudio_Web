import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = 'http://127.0.0.1:8000';
// Header con el token JWT que guardó el login. El backend saca de ahí el usuario.
const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });

const BANDS = [
  { hz: 40,    label: '40 Hz',  name: 'Sub-Bass',   icon: '💣', color: '#9B59B6', title: 'El Rugido',        tip: 'Kick drum, órgano de tubos, truenos' },
  { hz: 80,    label: '80 Hz',  name: 'Sub-Bass',   icon: '🐘', color: '#7D3C98', title: 'Graves Profundos', tip: 'Bajo eléctrico, batería pesada' },
  { hz: 125,   label: '125 Hz', name: 'Bass',       icon: '🥁', color: '#2980B9', title: 'Cuerpo del Bajo',  tip: 'Guitarra bass, kick drum' },
  { hz: 250,   label: '250 Hz', name: 'Bass',       icon: '🎸', color: '#1A5276', title: 'Calidez',          tip: 'Cuerpo del piano, guitarra acústica' },
  { hz: 500,   label: '500 Hz', name: 'Mid',        icon: '🎹', color: '#1E8449', title: 'Claridad Media',   tip: 'Voz masculina, cuerpo vocal' },
  { hz: 1000,  label: '1 kHz',  name: 'Referencia', icon: '🎤', color: '#D4AC0D', title: 'Centro Vocal',     tip: '¡El más importante! La frecuencia de referencia universal' },
  { hz: 2000,  label: '2 kHz',  name: 'Upper-Mid',  icon: '🎵', color: '#CA6F1E', title: 'Presencia Vocal',  tip: 'Voz femenina, definición de instrumentos' },
  { hz: 4000,  label: '4 kHz',  name: 'Presencia',  icon: '🔔', color: '#A93226', title: 'Nitidez',          tip: 'Consonantes del habla, ataque' },
  { hz: 8000,  label: '8 kHz',  name: 'Treble',     icon: '🎷', color: '#C0392B', title: 'Brillo',           tip: 'Platillos, agudos del violín' },
  { hz: 12000, label: '12 kHz', name: 'Hi-Treble',  icon: '✨', color: '#117A65', title: 'Aire',             tip: 'Overtones, espacialidad' },
  { hz: 16000, label: '16 kHz', name: 'Brillantez', icon: '⭐', color: '#0E6251', title: 'Extensión',        tip: 'Solo parlantes premium lo reproducen' },
];

const GAIN = { 40:0.9, 80:0.8, 125:0.7, 250:0.55, 500:0.42, 1000:0.35, 2000:0.3, 4000:0.27, 8000:0.3, 12000:0.35, 16000:0.42 };
const S_EMOJI = { 0:'❌', 2:'😕', 5:'😊', 8:'🔥', 10:'💥' };

function getDiagnosis(results) {
  const avg = arr => arr.length ? arr.reduce((s, r) => s + r.score, 0) / arr.length : 0;
  const sub   = avg(results.filter(r => r.hz <= 80));
  const bass  = avg(results.filter(r => r.hz > 80   && r.hz <= 250));
  const mids  = avg(results.filter(r => r.hz > 250  && r.hz <= 2000));
  const highs = avg(results.filter(r => r.hz > 2000));
  const overall = avg(results);

  const bandRatings = [
    { name: '💣 Sub-Bajos (40-80 Hz)',  score: sub,
      note: sub < 3 ? 'Casi nulo — normal en parlantes compactos' : sub < 5 ? 'Limitado' : sub < 7 ? 'Decente' : 'Potente y profundo' },
    { name: '🥁 Bajos (125-250 Hz)',    score: bass,
      note: bass < 4 ? 'Escaso' : bass < 6 ? 'Aceptable' : bass < 8 ? 'Bueno' : 'Sólido y cálido' },
    { name: '🎤 Medios (500-2000 Hz)',  score: mids,
      note: mids < 5 ? 'Débil — la voz sonará opaca' : mids < 7 ? 'Funcional' : mids < 9 ? 'Claro y definido' : 'Transparente — nivel de estudio' },
    { name: '✨ Agudos (4k-16k Hz)',    score: highs,
      note: highs < 4 ? 'Truncado — le faltan agudos' : highs < 6 ? 'Limitado' : highs < 8 ? 'Buena extensión' : 'Extendido y aireado' },
  ];

  let type, grade, desc;
  if      (overall >= 8.5)                             { type = '🏆 Monitor HiFi';   grade = 'A+'; desc = '¡Extraordinario! Respuesta plana y extendida. Parlantes audiófilo de primer nivel.'; }
  else if (overall >= 7  && sub >= 5)                  { type = '🎧 Sistema Hi-Fi';  grade = 'A';  desc = 'Excelente balance. Graves y agudos bien definidos. ¡La música suena como debe!'; }
  else if (mids >= 7 && bass >= 5 && highs >= 6)       { type = '🎵 Estudio Casero'; grade = 'B+'; desc = 'Sólidos en medios y agudos. Perfectos para música y podcast.'; }
  else if (mids >= 6 && highs >= 5 && sub < 4)         { type = '💻 Multimedia';     grade = 'B';  desc = 'Medios claros. Ideal para video, voz y contenido web. Sin graves profundos.'; }
  else if (bass >= 7 && highs < 4)                     { type = '🔈 Bass Heavy';     grade = 'C+'; desc = 'Graves dominantes pero le faltan agudos. Pierde detalle en la música.'; }
  else if (sub < 2 && mids >= 5)                       { type = '📱 Portátil';       grade = 'C';  desc = 'Sin graves profundos. Típico de smartphones y laptops.'; }
  else if (overall < 4)                                { type = '📺 Audio Básico';   grade = 'D';  desc = 'Respuesta muy limitada. Considera un sistema de audio externo.'; }
  else                                                  { type = '🔊 Estándar';       grade = 'C+'; desc = 'Respuesta funcional para uso cotidiano.'; }

  return { type, grade, desc, bandRatings, overall };
}

function FreqGraph({ results }) {
  const W = 560, H = 230;
  const P = { t: 25, r: 22, b: 55, l: 46 };
  const iW = W - P.l - P.r;
  const iH = H - P.t - P.b;
  const logMin = Math.log10(30), logMax = Math.log10(20000);
  const xOf = hz => P.l + ((Math.log10(hz) - logMin) / (logMax - logMin)) * iW;
  const yOf = s  => P.t + iH - (s / 10) * iH;
  const pts = results.map(r => ({ x: xOf(r.hz), y: yOf(r.score), ...r }));
  const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaD = `${lineD} L${pts[pts.length-1].x.toFixed(1)},${(P.t+iH).toFixed(1)} L${pts[0].x.toFixed(1)},${(P.t+iH).toFixed(1)}Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      <rect x={P.l} y={P.t} width={iW} height={iH} fill="#0d0507" rx="4" />
      <rect x={xOf(30)}   y={P.t} width={xOf(250)-xOf(30)}     height={iH} fill="rgba(155,89,182,0.08)" />
      <rect x={xOf(250)}  y={P.t} width={xOf(4000)-xOf(250)}   height={iH} fill="rgba(39,174,96,0.06)"  />
      <rect x={xOf(4000)} y={P.t} width={xOf(20000)-xOf(4000)} height={iH} fill="rgba(52,152,219,0.06)" />
      <text x={(xOf(30)+xOf(250))/2}     y={P.t+14} textAnchor="middle" fontSize="8" fill="rgba(155,89,182,0.9)">BAJOS</text>
      <text x={(xOf(250)+xOf(4000))/2}   y={P.t+14} textAnchor="middle" fontSize="8" fill="rgba(39,174,96,0.9)">MEDIOS</text>
      <text x={(xOf(4000)+xOf(20000))/2} y={P.t+14} textAnchor="middle" fontSize="8" fill="rgba(52,152,219,0.9)">AGUDOS</text>
      {[0,2,4,6,8,10].map(s => (
        <g key={s}>
          <line x1={P.l} y1={yOf(s)} x2={W-P.r} y2={yOf(s)}
            stroke={s === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'} strokeWidth="1" />
          <text x={P.l-6} y={yOf(s)+4} textAnchor="end" fontSize="10" fill="#554540">{s}</text>
        </g>
      ))}
      <line x1={P.l} y1={yOf(7)} x2={W-P.r} y2={yOf(7)} stroke="rgba(232,195,106,0.3)" strokeWidth="1" strokeDasharray="5,4" />
      <path d={areaD} fill="rgba(192,57,43,0.18)" />
      <path d={lineD} fill="none" stroke="#c0392b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="6" fill={results[i].color} stroke="#0d0507" strokeWidth="2" />
          {results[i].score <= 2 && <text x={p.x} y={p.y-13} textAnchor="middle" fontSize="11">⚠️</text>}
        </g>
      ))}
      {results.map(r => (
        <text key={`lbl-${r.hz}`} x={xOf(r.hz)} y={H-33} textAnchor="middle" fontSize="9" fill="#665040">
          {r.hz >= 1000 ? `${r.hz/1000}k` : r.hz}
        </text>
      ))}
      {results.map(r => (
        <text key={`ico-${r.hz}`} x={xOf(r.hz)} y={H-16} textAnchor="middle" fontSize="11">{r.icon}</text>
      ))}
      <text x={16} y={P.t + iH/2} textAnchor="middle" fontSize="9" fill="#554540"
        transform={`rotate(-90, 16, ${P.t + iH/2})`}>Claridad (0-10)</text>
      <text x={W/2} y={H} textAnchor="middle" fontSize="9" fill="#554540">Frecuencia (Hz)</text>
    </svg>
  );
}

const DRAGON_CSS = `
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
    font-family: 'Segoe UI', system-ui, sans-serif;
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
  const [selectedScore, setSelectedScore] = useState(null);
  const audioCtxRef = useRef(null);
  const oscRef      = useRef(null);

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

  const stopTone = () => {
    if (oscRef.current) {
      try { oscRef.current.stop(); } catch(e) {}
      oscRef.current = null;
    }
    setPlaying(false);
  };

  const playTone = () => {
    stopTone();
    const ctx  = getCtx();
    const freq = BANDS[current].hz;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(GAIN[freq], ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(GAIN[freq], ctx.currentTime + 2.7);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 3.0);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 3.0);
    oscRef.current = osc;
    setPlaying(true);
    setHasPlayed(true);
    osc.onended = () => { setPlaying(false); oscRef.current = null; };
  };

  const handleNext = () => {
    if (selectedScore === null) return;
    stopTone();
    const b = BANDS[current];
    const newResults = [...results, { hz: b.hz, label: b.label, icon: b.icon, color: b.color, name: b.name, score: selectedScore }];
    setResults(newResults);
    setSelectedScore(null);
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
    setSelectedScore(null);
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
    setSelectedScore(null);
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

  // Editar un puntaje a mano (sin rehacer la prueba). Limita a 0-10.
  const editScore = (i, delta) => {
    setResults(prev => prev.map((r, idx) =>
      idx === i ? { ...r, score: Math.max(0, Math.min(10, r.score + delta)) } : r
    ));
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
          <h1 className="at-title">🐉 DRAGON AUDIO</h1>
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
                <li>Tu <strong style={{ color: '#f0e6d2' }}>gráfica de respuesta en frecuencia</strong> personalizada</li>
                <li>El <strong style={{ color: '#f0e6d2' }}>perfil exacto</strong> de tus parlantes con diagnóstico</li>
                <li>Qué rangos son fuertes y cuáles tienen limitaciones</li>
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
                <span>Califica <strong style={{ color: '#f0e6d2' }}>qué tan claro lo oyes del 0 al 10</strong> para cada tono</span>
                <span style={{ color: '#e8c36a', fontWeight: 700 }}>4.</span>
                <span>Hazlo en un <strong style={{ color: '#f0e6d2' }}>lugar tranquilo</strong> para mayor precisión</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 7, marginBottom: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
              {['11 frecuencias', '~3 minutos', 'Escala 0-10', 'Gráfica incluida', 'Diagnóstico'].map(tag => (
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
              <div style={{ fontSize: 30, fontWeight: 900, color: '#f0e6d2', letterSpacing: -1 }}>{b.label}</div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2.5, color: b.color, margin: '4px 0 8px', fontWeight: 600 }}>{b.name}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#c0a878', marginBottom: 4 }}>"{b.title}"</div>
              <div style={{ fontSize: 13, color: '#7a6a50' }}>{b.tip}</div>

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
                <div style={{ fontSize: 12, color: '#7a6a50', marginTop: 5 }}>Tono completado — ahora califica</div>
              )}
            </div>

            {/* Botón reproducir */}
            <button
              onClick={playTone}
              disabled={playing}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                background: playing ? 'rgba(255,255,255,0.04)' : b.color,
                color: playing ? '#444' : '#fff',
                fontSize: 15, fontWeight: 700,
                cursor: playing ? 'default' : 'pointer',
                marginBottom: 12, transition: 'background 0.2s',
              }}
            >
              {playing ? '⏸ Reproduciendo...' : hasPlayed ? '↺ Repetir Tono' : '▶ Reproducir Tono'}
            </button>

            {/* Calificación */}
            <div className="at-card" style={{ marginBottom: 12 }}>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: hasPlayed ? '#f0e6d2' : '#3a2a18' }}>
                  {hasPlayed ? '¿Qué tan claro lo escuchas? (0-10)' : '▶ Primero reproduce el tono'}
                </p>
                {hasPlayed && (
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#7a6a50' }}>
                    0 = No escucho nada &nbsp;·&nbsp; 10 = Perfecto y cristalino
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                {[0,1,2,3,4,5,6,7,8,9,10].map(n => {
                  const isSel = selectedScore === n;
                  return (
                    <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <button
                        onClick={() => { if (hasPlayed) setSelectedScore(n); }}
                        style={{
                          width: 36, height: 36, borderRadius: '50%',
                          border: isSel ? '2px solid #e8c36a' : '2px solid rgba(232,195,106,0.13)',
                          background: isSel ? 'linear-gradient(135deg, #c0392b, #e8c36a)' : 'rgba(28,10,12,0.5)',
                          color: isSel ? '#fff' : (hasPlayed ? '#b89b6a' : '#2e1e0e'),
                          fontSize: 13, fontWeight: 700,
                          cursor: hasPlayed ? 'pointer' : 'default',
                          transition: 'all 0.12s',
                          boxShadow: isSel ? '0 0 12px rgba(232,195,106,0.35)' : 'none',
                        }}
                      >{n}</button>
                      <span style={{ fontSize: 10, minHeight: 13 }}>{S_EMOJI[n] || ''}</span>
                    </div>
                  );
                })}
              </div>

              {selectedScore !== null && (
                <div style={{
                  marginTop: 12, padding: '8px 14px', textAlign: 'center',
                  background: 'rgba(192,57,43,0.14)', borderRadius: 8,
                  border: '1px solid rgba(232,195,106,0.22)',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e8c36a' }}>
                    Seleccionaste: {selectedScore}/10 &nbsp;
                    {selectedScore === 0 ? '— sin señal detectada'
                      : selectedScore < 4 ? '— apenas perceptible'
                      : selectedScore < 7 ? '— claridad media'
                      : selectedScore < 9 ? '— excelente claridad'
                      : '— ¡perfectamente nítido!'}
                  </span>
                </div>
              )}
            </div>

            {/* Siguiente */}
            <button
              onClick={handleNext}
              disabled={selectedScore === null}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12,
                border: selectedScore !== null ? '1px solid rgba(232,195,106,0.35)' : 'none',
                background: selectedScore !== null
                  ? 'linear-gradient(135deg, #7a1515, #c0392b)'
                  : 'rgba(255,255,255,0.04)',
                color: selectedScore !== null ? '#f0e6d2' : '#2e1e0e',
                fontSize: 15, fontWeight: 700,
                cursor: selectedScore !== null ? 'pointer' : 'default',
                transition: 'all 0.2s',
                boxShadow: selectedScore !== null ? '0 0 20px rgba(192,57,43,0.3)' : 'none',
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
          const dx = getDiagnosis(results);
          const gradeColors = { 'A+': '#2ECC71', A: '#27AE60', 'B+': '#e8c36a', B: '#E67E22', 'C+': '#E67E22', C: '#E74C3C', D: '#C0392B' };
          const gc = gradeColors[dx.grade] || '#e8c36a';
          return (
            <>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 30, marginBottom: 4 }}>📊</div>
                <h2 style={{ margin: 0, fontSize: 19, color: '#f0e6d2' }}>Respuesta de Frecuencia</h2>
                <p style={{ margin: '3px 0 0', color: '#6a5a40', fontSize: 13 }}>Así suenan tus parlantes en todo el espectro audible</p>
              </div>

              <div className="at-card" style={{ padding: '14px 8px' }}>
                <FreqGraph results={results} />
              </div>

              <div className="at-card" style={{ borderColor: `${gc}44`, background: `${gc}10` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#f0e6d2', marginBottom: 4 }}>{dx.type}</div>
                    <div style={{ fontSize: 13, color: '#b89b6a', lineHeight: 1.6 }}>{dx.desc}</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 64 }}>
                    <div style={{ fontSize: 36, fontWeight: 900, color: gc, lineHeight: 1 }}>{dx.grade}</div>
                    <div style={{ fontSize: 11, color: '#6a5a40', marginTop: 2 }}>Calificación</div>
                    <div style={{ fontSize: 13, color: gc, marginTop: 3, fontWeight: 700 }}>{dx.overall.toFixed(1)}/10</div>
                  </div>
                </div>
              </div>

              <div className="at-card">
                <h3 style={{ margin: '0 0 14px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: '#6a5a40' }}>Análisis por Rango</h3>
                {dx.bandRatings.map((br, i) => (
                  <div key={i} style={{ marginBottom: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: '#c0a878' }}>{br.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#f0e6d2' }}>{br.score.toFixed(1)}/10</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 2.5, overflow: 'hidden', marginBottom: 3 }}>
                      <div style={{ height: '100%', width: `${(br.score / 10) * 100}%`, background: 'linear-gradient(90deg, #c0392b, #e8c36a)', borderRadius: 2.5 }} />
                    </div>
                    <div style={{ fontSize: 12, color: '#6a5a40' }}>{br.note}</div>
                  </div>
                ))}
              </div>

              <div className="at-card">
                <h3 style={{ margin: '0 0 12px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: '#6a5a40' }}>Detalle por Frecuencia</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 7 }}>
                  {results.map((r, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      padding: '8px 11px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.02)', border: `1px solid ${r.color}33`,
                    }}>
                      <span style={{ fontSize: 18 }}>{r.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: '#6a5a40', marginBottom: 3 }}>{r.label} · {r.name}</div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${r.score * 10}%`, background: r.color, borderRadius: 2 }} />
                        </div>
                      </div>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => editScore(i, -1)} title="Bajar"
                          style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid rgba(232,195,106,0.3)', background: 'rgba(0,0,0,0.3)', color: '#e8c36a', cursor: 'pointer', lineHeight: '16px', padding: 0 }}>−</button>
                        <span style={{
                          fontWeight: 800, fontSize: 14, minWidth: 16, textAlign: 'center',
                          color: r.score >= 7 ? '#2ECC71' : r.score >= 4 ? '#e8c36a' : '#E74C3C',
                        }}>{r.score}</span>
                        <button onClick={() => editScore(i, 1)} title="Subir"
                          style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid rgba(232,195,106,0.3)', background: 'rgba(0,0,0,0.3)', color: '#e8c36a', cursor: 'pointer', lineHeight: '16px', padding: 0 }}>+</button>
                      </span>
                    </div>
                  ))}
                </div>
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
