// ════════════════════════════════════════════════════════════════════════
//  CADENA DE AUDIO — arma el grafo Web Audio conectando los efectos en serie
//  (como pedales de guitarra):
//
//    source → [eq] → [reverb] → [comp] → [stereo] → analyser → master → out
//
//  ── Cómo añadir un efecto nuevo en el futuro ──
//  1. Crea su módulo en effects/ siguiendo la interfaz común:
//       create(ctx, params, active) → { input, output, ...nodos propios }
//       update(nodes, params, active)
//  2. Impórtalo aquí y agrégalo a EFFECT_CHAIN en la posición deseada.
//  3. En MusicPlayer: añade su estado/sliders, pásale sus params en
//     startEqualizer y un useEffect que llame a su update() en vivo.
//  El cableado entre efectos es automático: cada uno expone input/output.
// ════════════════════════════════════════════════════════════════════════
import * as equalizer from './effects/equalizer';
import * as reverb from './effects/reverb';
import * as compressor from './effects/compressor';
import * as stereo from './effects/stereo';
import * as masterVolume from './effects/masterVolume';

// Orden real de procesado. La clave (key) es la misma que usan los botones
// Solo/Mute y el objeto de params del MusicPlayer.
export const EFFECT_CHAIN = [
  { key: 'eq',     module: equalizer  },
  { key: 'reverb', module: reverb     },
  { key: 'comp',   module: compressor },
  { key: 'stereo', module: stereo     },
];

// Construye la cadena completa y la conecta a la salida.
//   params   = { eq: {...}, reverb: {...}, comp: {...}, stereo: {...}, volume: { volume, muted } }
//   isActive = (key) => bool — resuelve el estado Solo/Mute de cada efecto.
// Devuelve { effects, analyser, master } con referencias a todos los nodos,
// para poder modificarlos en vivo sin reconstruir el grafo.
export function buildChain(ctx, source, params, isActive) {
  const effects = {};
  let prev = source;
  for (const { key, module } of EFFECT_CHAIN) {
    const nodes = module.create(ctx, params[key], isActive(key));
    prev.connect(nodes.input);
    prev = nodes.output;
    effects[key] = nodes;
  }

  // Analyser: lee la señal en paralelo y alimenta el visualizador.
  // fftSize=1024 → 512 bins, curva mucho más suave que con 256.
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.82;
  prev.connect(analyser);

  // Master gain: volumen final antes de la salida.
  const master = masterVolume.create(ctx, params.volume, params.volume.muted);
  analyser.connect(master.input);
  master.output.connect(ctx.destination);

  return { effects, analyser, master };
}
