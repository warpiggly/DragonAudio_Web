import React, { useState } from 'react';

const FREQUENCIES = [250, 500, 1000, 2000, 4000, 8000];

export default function AudioTest() {
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState([]);
  const [playing, setPlaying] = useState(false);

  const playTone = (freq) => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = freq;
    gainNode.gain.value = 0.5;

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    setPlaying(true);

    setTimeout(() => {
      oscillator.stop();
      setPlaying(false);
    }, 2000);
  };

  const handleResponse = (score) => {
    const newResults = [...results, {
      frequency: FREQUENCIES[current],
      score
    }];
    setResults(newResults);

    if (current < FREQUENCIES.length - 1) {
      setCurrent(current + 1);
    }
  };

  const finished = results.length === FREQUENCIES.length;

  return (
    <div style={{ maxWidth: 500, margin: '50px auto', padding: 20, textAlign: 'center' }}>
      <h1>Prueba de Audio 🎧</h1>

      {!finished ? (
        <>
          <h2>Frecuencia: {FREQUENCIES[current]} Hz</h2>
          <p>Paso {current + 1} de {FREQUENCIES.length}</p>

          <button
            onClick={() => playTone(FREQUENCIES[current])}
            disabled={playing}
            style={{ padding: '15px 30px', fontSize: 16, marginBottom: 20 }}
          >
            {playing ? 'Reproduciendo...' : '▶ Reproducir Tono'}
          </button>

          <p>¿Qué tan claro lo escuchas?</p>
          <div>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => handleResponse(n)}
                style={{ padding: 10, margin: 5, fontSize: 16 }}
              >
                {n}
              </button>
            ))}
          </div>
          <p>1 = Nada | 5 = Muy claro</p>
        </>
      ) : (
        <>
          <h2>Resultados</h2>
          {results.map((r, i) => (
            <p key={i}>{r.frequency} Hz → {r.score}/5</p>
          ))}
        </>
      )}
    </div>
  );
}