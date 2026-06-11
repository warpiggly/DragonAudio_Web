// ════════════════════════════════════════════════════════════════════════
//  EFECTO: Reverb por convolución (simple)
//
//  La señal se divide en dos ramas paralelas: seca (dry) y reverberada (wet).
//  El slider de mezcla cruza las dos ganancias; el impulso es ruido con
//  caída exponencial generado al vuelo (makeReverbImpulse).
//
//  Interfaz común de efectos (ver audioChain.js):
//    create(ctx, params, active) → { input, output, ...nodos propios }
//    update(nodes, params, active) → sincroniza sliders → nodos en vivo
//    setDecay(ctx, nodes, decay)  → regenera el impulso (operación puntual)
// ════════════════════════════════════════════════════════════════════════

// Impulso sintético: ruido blanco estéreo con caída exponencial.
// Evita cargar archivos de respuesta de impulso — suena a "sala" genérica y es
// suficiente para una reverb simple. decay = segundos de cola.
export const makeReverbImpulse = (ctx, decay) => {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * decay));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
  }
  return impulse;
};

// La rama seca nunca baja de 0.5 (mezcla 100% = mitad seca + toda la cola).
const dryLevel = (mix) => 1 - (mix / 100) * 0.5;

// mix = 0..100 % wet · decay = segundos de cola.
export function create(ctx, { mix, decay }, active = true) {
  const input = ctx.createGain();   // punto único de entrada (reparte a las dos ramas)
  const output = ctx.createGain();  // punto único de salida (junta dry + wet)
  const convolver = ctx.createConvolver();
  convolver.buffer = makeReverbImpulse(ctx, decay);
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  dry.gain.value = active ? dryLevel(mix) : 1;
  wet.gain.value = active ? mix / 100 : 0;

  input.connect(dry);
  input.connect(convolver);
  convolver.connect(wet);
  dry.connect(output);
  wet.connect(output);

  return { input, output, convolver, dry, wet };
}

// Si está inactivo → 100% señal seca (sin reverb).
export function update(nodes, { mix }, active = true) {
  nodes.dry.gain.value = active ? dryLevel(mix) : 1;
  nodes.wet.gain.value = active ? mix / 100 : 0;
}

// Cambiar la duración regenera el impulso (no se hace por frame, solo al mover el slider).
export function setDecay(ctx, nodes, decay) {
  nodes.convolver.buffer = makeReverbImpulse(ctx, decay);
}
