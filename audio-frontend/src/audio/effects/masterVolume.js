// ════════════════════════════════════════════════════════════════════════
//  EFECTO: Volumen master — ganancia final antes de la salida
//
//  volume = 0..600 % (100 = ganancia unidad, nivel original).
//  El volumen solo se silencia con su propio Mute; el Solo de otros efectos
//  no lo apaga (sigue siendo el nivel de salida).
//
//  A diferencia del resto de efectos, update() usa una rampa exponencial
//  corta (~20 ms) para evitar clicks al saltar de volumen, por eso necesita
//  el AudioContext.
// ════════════════════════════════════════════════════════════════════════

export function create(ctx, { volume }, muted = false) {
  const gain = ctx.createGain();
  gain.gain.value = muted ? 0 : volume / 100;
  return { input: gain, output: gain, gain };
}

export function update(ctx, nodes, { volume }, muted = false) {
  const target = muted ? 0 : volume / 100;
  nodes.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
}
