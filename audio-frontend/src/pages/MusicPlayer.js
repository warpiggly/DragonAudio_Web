import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import API from '../api';
import { EQ_PRESETS, PRESET_CATEGORIES, combineGains } from '../data/eqPresets';
import VolumeKnob from '../components/VolumeKnob';
import { DEFAULTS } from '../audio/defaults';
import { buildChain } from '../audio/audioChain';
import { captureTabAudio, NO_AUDIO } from '../audio/capture';
import { createVisualizerLoop, paintIdle } from '../audio/visualizer';
import * as equalizer from '../audio/effects/equalizer';
import * as reverb from '../audio/effects/reverb';
import * as compressor from '../audio/effects/compressor';
import * as stereo from '../audio/effects/stereo';
import * as masterVolume from '../audio/effects/masterVolume';
import './MusicPlayer.css';

const { EQ_BANDS } = equalizer;

const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });

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
  const [reverbMix, setReverbMix] = useState(DEFAULTS.reverbMix);      // 0..100 % wet
  const [reverbDecay, setReverbDecay] = useState(DEFAULTS.reverbDecay); // 0.5..5 s
  const [pan, setPan] = useState(DEFAULTS.pan);                          // -1 izq · 0 centro · 1 der
  const [width, setWidth] = useState(DEFAULTS.width);                    // 0 mono · 1 normal · 2 amplio
  const [volume, setVolume] = useState(DEFAULTS.volume);                 // 0..600 % (master gain)

  // --- Solo / Mute por efecto ---
  // mute = el efecto pasa a neutro (no colorea la señal); para el volumen = silencio.
  // solo = si hay AL MENOS un efecto en solo, solo esos quedan activos; el resto va a neutro.
  // El volumen master nunca se silencia por el solo de otro (sigue siendo el nivel de salida),
  // pero sí puede mutearse aparte o ponerse en solo para escuchar la señal sin EQ/comp/estéreo.
  const [muted, setMuted] = useState({ eq: false, comp: false, reverb: false, stereo: false, volume: false });
  const [solo, setSolo]   = useState({ eq: false, comp: false, reverb: false, stereo: false, volume: false });

  // Decide si un efecto debe estar aplicando su procesado en este momento.
  const effectActive = (key) => {
    const anySolo = solo.eq || solo.comp || solo.reverb || solo.stereo || solo.volume;
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

  // --- Ecualización temática (preset) que se SUMA encima de la curva del test/IA ---
  // profileGains  = curva BASE (test invertido + IA). Si no hay test, son 0s.
  // selectedPresetId = preset elegido por el usuario (o null = ninguno).
  // El EQ real (eqGains) = combineGains(profileGains, selectedPresetId), recortado a ±12.
  const [profileGains, setProfileGains] = useState(DEFAULTS.eqGains);
  const [selectedPresetId, setSelectedPresetId] = useState(null);
  const [presetCategory, setPresetCategory] = useState('Todas');

  // Secciones plegables (abrir/cerrar).
  const [profilesOpen, setProfilesOpen] = useState(true);
  const [presetsOpen, setPresetsOpen] = useState(false);

  // --- Referencias al motor de audio (persisten entre renders, no disparan re-render) ---
  const audioCtxRef = useRef(null);   // AudioContext: motor del grafo de audio
  const streamRef = useRef(null);     // MediaStream capturado de la pestaña
  const chainRef = useRef(null);      // { effects, analyser, master } — toda la cadena (ver audioChain.js)
  const canvasRef = useRef(null);     // <canvas> donde se dibuja el visualizador
  const bgRef = useRef(null);         // contenedor del fondo: recibe el "latido" (--beat) por CSS var
  const vizRef = useRef(null);        // loop del visualizador (createVisualizerLoop)

  // El loop del visualizador se crea una sola vez; lee analyser/canvas por
  // getters porque no existen hasta que se captura audio.
  const getViz = () => {
    if (!vizRef.current) {
      vizRef.current = createVisualizerLoop({
        getAnalyser: () => (chainRef.current ? chainRef.current.analyser : null),
        getCanvas: () => canvasRef.current,
        onBeat: (bass) => {
          if (bgRef.current) bgRef.current.style.setProperty('--beat', bass.toFixed(3));
        },
      });
    }
    return vizRef.current;
  };

  // Arranca toda la cadena DSP. Pide al usuario compartir una pestaña con audio,
  // construye el grafo Web Audio (ver audioChain.js) y lo conecta a la salida.
  // Ruta: source → [eq] → [reverb] → [comp] → [stereo] → analyser → master → out
  const startEqualizer = async () => {
    setEqError('');
    try {
      const { stream, audioStream, audioTrack } = await captureTabAudio();

      const ctx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: 'playback',
      });
      const source = ctx.createMediaStreamSource(audioStream);

      // Cada efecto recibe sus parámetros actuales y su estado Solo/Mute.
      const chain = buildChain(ctx, source, {
        eq:     { gains: eqGains },
        reverb: { mix: reverbMix, decay: reverbDecay },
        comp:   { threshold: compThreshold, ratio: compRatio },
        stereo: { pan, width },
        volume: { volume, muted: muted.volume },
      }, effectActive);

      // Guardamos referencias para poder modificar los nodos sin reconstruir el grafo
      audioCtxRef.current = ctx;
      streamRef.current = stream;
      chainRef.current = chain;

      // Si el usuario detiene la compartición desde el navegador, paramos limpiamente.
      audioTrack.addEventListener('ended', () => stopEqualizer());

      setEqActive(true);
      if (visualMode === 'full') getViz().start();
    } catch (err) {
      setEqError(
        err.code === NO_AUDIO
          ? 'No se compartió audio. Vuelve a intentarlo y marca la casilla "Compartir audio de la pestaña".'
          : 'No se pudo iniciar el ecualizador: ' + err.message
      );
    }
  };

  // Libera todos los recursos: animación, tracks de captura, AudioContext y refs.
  const stopEqualizer = () => {
    if (vizRef.current) vizRef.current.stop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    chainRef.current = null;

    if (bgRef.current) bgRef.current.style.setProperty('--beat', '0');
    if (canvasRef.current) paintIdle(canvasRef.current);
    setEqActive(false);
  };

  // --- Sincronización estado React → nodos Web Audio ---
  // Cada vez que el usuario mueve un slider (o pulsa ↺), propagamos el valor
  // directamente al efecto correspondiente (update de su módulo), sin
  // reconstruir la cadena. Cada efecto recibe también su estado Solo/Mute:
  // si está inactivo, su update() lo deja en neutro.
  useEffect(() => {
    const chain = chainRef.current;
    if (chain) equalizer.update(chain.effects.eq, { gains: eqGains }, effectActive('eq'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eqGains, muted, solo]);
  useEffect(() => {
    const chain = chainRef.current;
    if (chain) compressor.update(chain.effects.comp, { threshold: compThreshold, ratio: compRatio }, effectActive('comp'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compThreshold, compRatio, muted, solo]);
  useEffect(() => {
    const chain = chainRef.current;
    if (chain) reverb.update(chain.effects.reverb, { mix: reverbMix }, effectActive('reverb'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reverbMix, muted, solo]);
  useEffect(() => {
    // Cambiar la duración regenera el impulso (operación puntual, no por frame).
    const chain = chainRef.current;
    if (chain && audioCtxRef.current) reverb.setDecay(audioCtxRef.current, chain.effects.reverb, reverbDecay);
  }, [reverbDecay]);
  useEffect(() => {
    const chain = chainRef.current;
    if (chain) stereo.update(chain.effects.stereo, { pan, width }, effectActive('stereo'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pan, width, muted, solo]);
  useEffect(() => {
    // Rampa exponencial corta (~20 ms) para evitar clicks al saltar de volumen.
    // El volumen solo se silencia con su propio Mute; el solo de otros efectos no lo apaga.
    const chain = chainRef.current;
    if (chain && audioCtxRef.current) masterVolume.update(audioCtxRef.current, chain.master, { volume }, muted.volume);
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
        const base = g.map(v => Math.round(v));
        setProfileGains(base);                            // curva base del test/IA
        setEqGains(combineGains(base, selectedPresetId)); // base + preset (si hay)
        setActiveProfileId(String(id));
        localStorage.setItem('dragonActiveTestId', String(id));
        setIaMsg('🤖 EQ = curva invertida de tu test + ajuste de la IA. Puedes afinarlo a mano.');
      }
    } catch (e) {
      setIaMsg('');   // sin sesión / sin modelo: se queda como esté
    }
  };

  // Aplica (o quita) una ecualización temática ENCIMA de la curva base del test/IA.
  // Volver a pulsar el preset activo lo desactiva (vuelve a la curva base sola).
  const applyPreset = (id) => {
    const next = selectedPresetId === id ? null : id;
    setSelectedPresetId(next);
    setEqGains(combineGains(profileGains, next));
  };

  // Quita el perfil de dispositivo activo: la curva base vuelve a plana (0 dB).
  // Si hay un preset puesto, se conserva (queda solo el preset).
  const clearProfile = () => {
    setProfileGains(DEFAULTS.eqGains);
    setEqGains(combineGains(DEFAULTS.eqGains, selectedPresetId));
    setActiveProfileId(null);
    localStorage.removeItem('dragonActiveTestId');
    setIaMsg('');
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
    if (visualMode === 'simple') getViz().stop();
    else getViz().start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualMode, eqActive]);

  // Cleanup al desmontar: corta la animación, libera el stream y cierra el AudioContext.
  useEffect(() => {
    return () => {
      if (vizRef.current) vizRef.current.stop();
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

  // Cabecera plegable: clic en cualquier parte abre/cierra. `extra` (botones a la
  // derecha, p.ej. ✕ Quitar) frena la propagación para no togglear al pulsarlo.
  const collapsibleHeader = (title, open, setOpen, extra = null) => (
    <div
      onClick={() => setOpen((o) => !o)}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: 8, marginBottom: open ? 12 : 0 }}
    >
      <h3 style={{ ...sectionTitle, margin: 0 }}>{title}</h3>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {extra}
        <span style={{ fontSize: 11, color: '#e8c36a', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
      </span>
    </div>
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

        {/* Botón principal: pide permiso de captura o detiene el procesador.
            Estética VST/dragón: panel oscuro, borde dorado, "LED de power" y
            tipografía Cinzel en mayúsculas. Sin emojis. */}
        <div style={{ marginBottom: 15, display: 'flex', justifyContent: 'center' }}>
          {!eqActive ? (
            <button
              onClick={startEqualizer}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#e8c36a';
                e.currentTarget.style.boxShadow = '0 0 34px rgba(232,195,106,0.45), inset 0 0 22px rgba(120,10,20,0.3)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(232,195,106,0.55)';
                e.currentTarget.style.boxShadow = '0 0 22px rgba(232,195,106,0.22), inset 0 0 18px rgba(120,10,20,0.28)';
                e.currentTarget.style.transform = 'none';
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 13,
                padding: '14px 34px',
                background: 'linear-gradient(135deg, rgba(232,195,106,0.16), rgba(120,10,20,0.22))',
                border: '1px solid rgba(232,195,106,0.55)',
                borderRadius: 10,
                color: '#f0d68a',
                fontFamily: "'Cinzel', serif",
                fontSize: 14, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: '0 0 22px rgba(232,195,106,0.22), inset 0 0 18px rgba(120,10,20,0.28)',
                transition: 'all 0.2s ease',
              }}
            >
              {/* LED de power dorado-brasa */}
              <span style={{
                width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                background: 'radial-gradient(circle, #f4cf6b 0%, #c0392b 85%)',
                boxShadow: '0 0 8px rgba(244,207,107,0.95), 0 0 16px rgba(192,57,43,0.65)',
              }} />
              Capturar Audio
            </button>
          ) : (
            <button
              onClick={stopEqualizer}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#dc3545';
                e.currentTarget.style.boxShadow = '0 0 32px rgba(220,53,69,0.5), inset 0 0 20px rgba(80,5,8,0.4)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(220,53,69,0.55)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(220,53,69,0.28), inset 0 0 18px rgba(80,5,8,0.35)';
                e.currentTarget.style.transform = 'none';
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 13,
                padding: '14px 34px',
                background: 'linear-gradient(135deg, rgba(192,57,43,0.28), rgba(80,5,8,0.35))',
                border: '1px solid rgba(220,53,69,0.55)',
                borderRadius: 10,
                color: '#ff9b8a',
                fontFamily: "'Cinzel', serif",
                fontSize: 14, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: '0 0 20px rgba(220,53,69,0.28), inset 0 0 18px rgba(80,5,8,0.35)',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Indicador "stop" cuadrado en brasa roja */}
              <span style={{
                width: 9, height: 9, borderRadius: 2, flexShrink: 0,
                background: 'linear-gradient(135deg, #ff6b5a, #c0392b)',
                boxShadow: '0 0 8px rgba(220,53,69,0.95), 0 0 16px rgba(120,10,20,0.7)',
              }} />
              Detener Captura
            </button>
          )}
          {eqError && <p style={{ color: 'red', marginTop: 8 }}>{eqError}</p>}
        </div>

        {/* Los efectos solo aparecen DESPUÉS de capturar una página con audio. */}
        {!eqActive && (
          <div style={{
            padding: '28px 20px', textAlign: 'center', borderRadius: 10,
            background: 'rgba(28,10,12,0.4)', border: '1px dashed rgba(232,195,106,0.25)',
            color: '#8a7a60', fontSize: 13, lineHeight: 1.6,
          }}>
            🐉 Pulsa <b style={{ color: '#e8c36a' }}>🎧 Capturar página de audio</b> y elige la pestaña con tu música.<br />
            Los controles (perfiles, ecualizaciones, compresor, estéreo y volumen) aparecerán al capturar.
          </div>
        )}

        {eqActive && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
              {/* Botón de reset a 100 (la perilla no tiene su propio ↺) */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
                <button
                  type="button"
                  onClick={() => setVolume(DEFAULTS.volume)}
                  title="Restablecer a 100 (original)"
                  style={resetBtnStyle}
                >↺ 100</button>
              </div>
              <VolumeKnob volume={volume} setVolume={setVolume} />
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

          {/* Perfiles: cambia entre dispositivos calibrados sin repetir el test. */}
          <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
            {collapsibleHeader(
              '🎚️ Perfiles de tus dispositivos',
              profilesOpen,
              setProfilesOpen,
              activeProfileId && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); clearProfile(); }}
                  title="Quitar el test de dispositivo activo (EQ base vuelve a plano)"
                  style={{
                    ...resetBtnStyle, padding: '3px 12px', fontSize: 12, lineHeight: '16px',
                    background: 'rgba(220,53,69,0.12)', borderColor: 'rgba(220,53,69,0.4)', color: '#ff8a8a',
                  }}
                >✕ Quitar test</button>
              )
            )}
            {profilesOpen && (profiles.length === 0 ? (
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
            ))}
          </div>

          {/* Ecualizaciones temáticas: curvas predefinidas que se SUMAN sobre el test/IA. */}
          <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
            {collapsibleHeader(
              '🎵 Ecualizaciones temáticas',
              presetsOpen,
              setPresetsOpen,
              selectedPresetId && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); applyPreset(selectedPresetId); }}
                  title="Quitar la ecualización temática y volver solo a tu test"
                  style={{
                    ...resetBtnStyle, padding: '3px 12px', fontSize: 12, lineHeight: '16px',
                    background: 'rgba(220,53,69,0.12)', borderColor: 'rgba(220,53,69,0.4)', color: '#ff8a8a',
                  }}
                >✕ Quitar</button>
              )
            )}
            {presetsOpen && (<>
            <p style={{ fontSize: 12, color: '#8a7a60', margin: '0 0 12px' }}>
              Elige un sonido para tu música. Se <b style={{ color: '#c0a878' }}>suma encima</b> de la
              curva de tu test{activeProfileId ? '' : ' (o úsala sola si aún no tienes uno)'} y puedes afinar a mano después.
            </p>

            {/* Chips de categoría */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {['Todas', ...PRESET_CATEGORIES].map((cat) => {
                const active = presetCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setPresetCategory(cat)}
                    style={{
                      padding: '4px 12px', borderRadius: 14, cursor: 'pointer', fontSize: 11,
                      fontFamily: "'Cinzel', serif", letterSpacing: 0.5, transition: 'all 0.15s',
                      background: active ? 'rgba(232,195,106,0.2)' : 'rgba(28,10,12,0.5)',
                      border: `1px solid ${active ? '#e8c36a' : 'rgba(232,195,106,0.22)'}`,
                      color: active ? '#f0d68a' : '#8a7a60', fontWeight: active ? 700 : 500,
                    }}
                  >{cat}</button>
                );
              })}
            </div>

            {/* Tarjetas de preset */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
              {EQ_PRESETS
                .filter((p) => presetCategory === 'Todas' || p.category === presetCategory)
                .map((p) => {
                  const active = selectedPresetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      title={p.purpose}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                        padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                        background: active ? 'linear-gradient(135deg, #7a1515, #c0392b)' : 'rgba(28,10,12,0.5)',
                        border: `1px solid ${active ? '#e8c36a' : 'rgba(232,195,106,0.2)'}`,
                        color: active ? '#fff' : '#c0a878',
                        boxShadow: active ? '0 0 16px rgba(232,195,106,0.4)' : 'none',
                        transition: 'all 0.15s', fontFamily: "'Cinzel', serif",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{active ? '🟢' : '🎵'} {p.name}</span>
                      <span style={{ fontSize: 10, opacity: 0.85, lineHeight: 1.35, fontFamily: 'sans-serif' }}>{p.purpose}</span>
                      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                        {p.best_for.map((b) => (
                          <span key={b} style={{
                            fontSize: 9, padding: '1px 6px', borderRadius: 8, fontFamily: 'sans-serif',
                            background: active ? 'rgba(255,255,255,0.18)' : 'rgba(232,195,106,0.1)',
                            color: active ? '#ffe9c2' : '#9a895f',
                          }}>{b}</span>
                        ))}
                      </span>
                    </button>
                  );
                })}
            </div>
            </>)}
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

          {/* Reverb — convolución simple con impulso sintético (mezcla dry/wet + cola). */}
          <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
            {effectHeader('Reverb', 'reverb')}
            <div style={{ opacity: effectActive('reverb') ? 1 : 0.4, transition: 'opacity 0.2s' }}>
            {slider('Mezcla (seco ← → reverberado)', reverbMix, setReverbMix, 0, 100, 1, ' %', DEFAULTS.reverbMix)}
            {slider('Cola (duración de la sala)', reverbDecay, setReverbDecay, 0.5, 5, 0.1, ' s', DEFAULTS.reverbDecay)}
            <p style={{ fontSize: 11, color: '#888', margin: 0 }}>
              Mezcla 0% = sin efecto. Cola corta = habitación pequeña · larga = catedral.
            </p>
            </div>
          </div>

        </div>
        )}

        <ul style={{ fontSize: 12, color: '#b89b6a', paddingLeft: 18, marginTop: 12 }}>
          <li>Funciona en Chrome, Edge y Brave. No en Firefox ni Safari.</li>
          <li>
            En el diálogo elige <b style={{ color: '#e8c36a' }}>"Pestaña de Chrome"</b>, selecciona la pestaña con tu música y activa <b style={{ color: '#e8c36a' }}>"Compartir audio de la pestaña"</b>.
          </li>
          <li>
            La pestaña original se <b style={{ color: '#e8c36a' }}>silencia sola</b> mientras capturas (oyes solo la versión del dragón). Al pulsar <b style={{ color: '#e8c36a' }}>Detener</b> recupera su sonido.
          </li>
        </ul>
      </div>
      </div>
    </div>
  );
}
