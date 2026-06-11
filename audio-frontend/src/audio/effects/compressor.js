// ════════════════════════════════════════════════════════════════════════
//  EFECTO: Compresor dinámico
//
//  Reduce los picos que superan el threshold con la relación ratio:1.
//  knee=30 → transición suave alrededor del umbral; attack/release típicos
//  para música.
//
//  Interfaz común de efectos (ver audioChain.js):
//    create(ctx, params, active) → { input, output, ...nodos propios }
//    update(nodes, params, active) → sincroniza sliders → nodos en vivo
// ════════════════════════════════════════════════════════════════════════

export function create(ctx, { threshold, ratio }, active = true) {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = active ? threshold : 0;
  compressor.ratio.value = active ? ratio : 1;
  compressor.knee.value = 30;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  return { input: compressor, output: compressor, compressor };
}

// Si está inactivo → threshold 0 / ratio 1 (sin compresión).
export function update(nodes, { threshold, ratio }, active = true) {
  nodes.compressor.threshold.value = active ? threshold : 0;
  nodes.compressor.ratio.value = active ? ratio : 1;
}
