// ════════════════════════════════════════════════════════════════════════
//  EFECTO: Ecualizador gráfico (9 bandas ISO 1-octava)
//
//  Cada banda = 1 BiquadFilter encadenado en serie sobre la señal.
//  Lowshelf en el extremo grave, highshelf en el extremo agudo,
//  peaking (campana) en las bandas centrales con Q ≈ 1.41 (~1/2 octava).
//
//  Interfaz común de efectos (ver audioChain.js):
//    create(ctx, params, active) → { input, output, ...nodos propios }
//    update(nodes, params, active) → sincroniza sliders → nodos en vivo
// ════════════════════════════════════════════════════════════════════════

export const EQ_BANDS = [
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

// Crea los 9 filtros ya encadenados entre sí.
// gains = array de dB por banda (la IA, el test o el usuario los definen).
export function create(ctx, { gains }, active = true) {
  const filters = EQ_BANDS.map((band, i) => {
    const f = ctx.createBiquadFilter();
    f.type = band.type;
    f.frequency.value = band.freq;
    if (band.type === 'peaking') f.Q.value = 1.41; // ancho ≈ 1/2 octava
    f.gain.value = active ? gains[i] : 0;
    return f;
  });
  for (let i = 0; i < filters.length - 1; i++) {
    filters[i].connect(filters[i + 1]);
  }
  return { input: filters[0], output: filters[filters.length - 1], filters };
}

// Si está inactivo (Mute, o Solo en otro efecto) → curva plana (0 dB).
export function update(nodes, { gains }, active = true) {
  nodes.filters.forEach((f, i) => {
    if (f) f.gain.value = active ? gains[i] : 0;
  });
}
