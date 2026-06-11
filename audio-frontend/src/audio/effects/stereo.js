// ════════════════════════════════════════════════════════════════════════
//  EFECTO: Estéreo — ancho de imagen (cross-mix L↔R) + paneo
//
//  Ancho estéreo por mezcla M/S simplificada:
//    newL = L*(1+w)/2 + R*(1-w)/2
//    newR = R*(1+w)/2 + L*(1-w)/2
//  w=0 → mono · w=1 → estéreo original · w=2 → cancela parte del mid (más ambiente)
//
//  Separamos canales con Splitter, los mezclamos con 4 GainNodes, los volvemos
//  a unir con Merger y al final un StereoPanner da el balance L/R (-1 a 1).
//
//  Interfaz común de efectos (ver audioChain.js):
//    create(ctx, params, active) → { input, output, ...nodos propios }
//    update(nodes, params, active) → sincroniza sliders → nodos en vivo
// ════════════════════════════════════════════════════════════════════════

export function create(ctx, { pan, width }, active = true) {
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const gLL = ctx.createGain();
  const gRR = ctx.createGain();
  const gLR = ctx.createGain();
  const gRL = ctx.createGain();
  const panner = ctx.createStereoPanner();

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

  const nodes = { input: splitter, output: panner, panner, gains: { LL: gLL, RR: gRR, LR: gLR, RL: gRL } };
  update(nodes, { pan, width }, active);
  return nodes;
}

// Si está inactivo → pan centrado y ancho normal (w=1).
export function update(nodes, { pan, width }, active = true) {
  const w = active ? width : 1;
  const direct = (1 + w) / 2;
  const cross = (1 - w) / 2;
  nodes.gains.LL.gain.value = direct;
  nodes.gains.RR.gain.value = direct;
  nodes.gains.LR.gain.value = cross;
  nodes.gains.RL.gain.value = cross;
  nodes.panner.pan.value = active ? pan : 0;
}
