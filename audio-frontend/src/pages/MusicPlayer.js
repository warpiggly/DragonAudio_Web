import React, { useState, useRef, useEffect } from 'react';

export default function MusicPlayer() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [soundcloudUrl, setSoundcloudUrl] = useState('');
  const [showSoundcloud, setShowSoundcloud] = useState(false);

  const [bass, setBass] = useState(0);
  const [mid, setMid] = useState(0);
  const [treble, setTreble] = useState(0);
  const [compThreshold, setCompThreshold] = useState(-24);
  const [compRatio, setCompRatio] = useState(4);
  const [pan, setPan] = useState(0);
  const [width, setWidth] = useState(1);
  const [volume, setVolume] = useState(100);

  const [eqActive, setEqActive] = useState(false);
  const [eqError, setEqError] = useState('');

  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const bassFilterRef = useRef(null);
  const midFilterRef = useRef(null);
  const trebleFilterRef = useRef(null);
  const compressorRef = useRef(null);
  const pannerRef = useRef(null);
  const widthGainsRef = useRef(null);
  const masterGainRef = useRef(null);
  const analyserRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

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

  const drawVisualizer = () => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) {
      rafRef.current = requestAnimationFrame(drawVisualizer);
      return;
    }
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    const barWidth = (W / bufferLength) * 1.6;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 255;
      const barHeight = v * H;
      const hue = 200 - v * 200;
      ctx.fillStyle = `hsl(${hue}, 90%, 55%)`;
      ctx.fillRect(x, H - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
    rafRef.current = requestAnimationFrame(drawVisualizer);
  };

  const startEqualizer = async () => {
    setEqError('');
    try {
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

      try {
        await audioTracks[0].applyConstraints({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
        });
      } catch (_) {}

      stream.getVideoTracks().forEach((t) => t.stop());

      const audioStream = new MediaStream(audioTracks);
      const ctx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: 'playback',
      });
      const source = ctx.createMediaStreamSource(audioStream);

      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 200;
      bassFilter.gain.value = bass;

      const midFilter = ctx.createBiquadFilter();
      midFilter.type = 'peaking';
      midFilter.frequency.value = 1000;
      midFilter.Q.value = 1;
      midFilter.gain.value = mid;

      const trebleFilter = ctx.createBiquadFilter();
      trebleFilter.type = 'highshelf';
      trebleFilter.frequency.value = 3000;
      trebleFilter.gain.value = treble;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = compThreshold;
      compressor.ratio.value = compRatio;
      compressor.knee.value = 30;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // Width chain: split L/R, cross-mix via 4 gain nodes, recombine.
      // newL = L*(1+w)/2 + R*(1-w)/2 ; newR = R*(1+w)/2 + L*(1-w)/2
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const gLL = ctx.createGain();
      const gRR = ctx.createGain();
      const gLR = ctx.createGain();
      const gRL = ctx.createGain();

      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      const masterGain = ctx.createGain();
      masterGain.gain.value = volume / 100;

      source.connect(bassFilter);
      bassFilter.connect(midFilter);
      midFilter.connect(trebleFilter);
      trebleFilter.connect(compressor);
      compressor.connect(splitter);

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

      const direct = (1 + width) / 2;
      const cross = (1 - width) / 2;
      gLL.gain.value = direct;
      gRR.gain.value = direct;
      gLR.gain.value = cross;
      gRL.gain.value = cross;

      audioCtxRef.current = ctx;
      streamRef.current = stream;
      bassFilterRef.current = bassFilter;
      midFilterRef.current = midFilter;
      trebleFilterRef.current = trebleFilter;
      compressorRef.current = compressor;
      pannerRef.current = panner;
      widthGainsRef.current = { LL: gLL, RR: gRR, LR: gLR, RL: gRL };
      masterGainRef.current = masterGain;
      analyserRef.current = analyser;

      audioTracks[0].addEventListener('ended', () => stopEqualizer());

      setEqActive(true);
      rafRef.current = requestAnimationFrame(drawVisualizer);
    } catch (err) {
      setEqError('No se pudo iniciar el ecualizador: ' + err.message);
    }
  };

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
    bassFilterRef.current = null;
    midFilterRef.current = null;
    trebleFilterRef.current = null;
    compressorRef.current = null;
    pannerRef.current = null;
    widthGainsRef.current = null;
    masterGainRef.current = null;
    analyserRef.current = null;

    const canvas = canvasRef.current;
    if (canvas) {
      const cctx = canvas.getContext('2d');
      cctx.fillStyle = '#111';
      cctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    setEqActive(false);
  };

  useEffect(() => { if (bassFilterRef.current) bassFilterRef.current.gain.value = bass; }, [bass]);
  useEffect(() => { if (midFilterRef.current) midFilterRef.current.gain.value = mid; }, [mid]);
  useEffect(() => { if (trebleFilterRef.current) trebleFilterRef.current.gain.value = treble; }, [treble]);
  useEffect(() => { if (compressorRef.current) compressorRef.current.threshold.value = compThreshold; }, [compThreshold]);
  useEffect(() => { if (compressorRef.current) compressorRef.current.ratio.value = compRatio; }, [compRatio]);
  useEffect(() => { if (pannerRef.current) pannerRef.current.pan.value = pan; }, [pan]);
  useEffect(() => { applyWidth(width); }, [width]);
  useEffect(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume / 100, audioCtxRef.current.currentTime, 0.02);
    }
  }, [volume]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const slider = (label, value, setter, min, max, step = 1, unit = '') => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: '#555' }}>{value}{unit}</span>
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

      {/* YouTube */}
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

      {/* SoundCloud */}
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

      {/* Ecualizador */}
      <div style={{ background: '#f0f0f0', padding: 20, borderRadius: 10 }}>
        <h2 style={{ marginTop: 0 }}>🎛️ Procesador de Audio</h2>

        {/* Visualizador */}
        <canvas
          ref={canvasRef}
          width={760}
          height={140}
          style={{ width: '100%', height: 140, borderRadius: 8, background: '#111', marginBottom: 12, display: 'block' }}
        />

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
          {/* Ecualizador */}
          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Ecualizador</h3>
            {slider('Bajos (200 Hz)', bass, setBass, -12, 12, 1, ' dB')}
            {slider('Medios (1 kHz)', mid, setMid, -12, 12, 1, ' dB')}
            {slider('Agudos (3 kHz)', treble, setTreble, -12, 12, 1, ' dB')}
          </div>

          {/* Compresor */}
          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Compresor</h3>
            {slider('Threshold', compThreshold, setCompThreshold, -60, 0, 1, ' dB')}
            {slider('Ratio', compRatio, setCompRatio, 1, 20, 0.5, ':1')}
            <p style={{ fontSize: 11, color: '#888', margin: 0 }}>
              Threshold más bajo = comprime más. Ratio alto = aplasta los picos.
            </p>
          </div>

          {/* Estéreo */}
          <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
            <h3 style={sectionTitle}>Estéreo</h3>
            {slider('Paneo (L ← → R)', pan, setPan, -1, 1, 0.01)}
            {slider('Ancho estéreo (0 = mono · 1 = normal · 2 = ampliado)', width, setWidth, 0, 2, 0.01)}
          </div>

          {/* Volumen master */}
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
              <label style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span>Volumen (100 = original · 600 = amplificado x6)</span>
                <span
                  style={{
                    color:
                      volume > 300 ? '#dc3545' : volume > 100 ? '#c97a00' : '#555',
                    fontWeight: volume > 100 ? 'bold' : 'normal',
                  }}
                >
                  {volume}
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
