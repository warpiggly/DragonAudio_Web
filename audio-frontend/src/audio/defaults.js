// Valores por defecto del procesador — referencia única usada por los
// botones ↺ (reset) y por el estado inicial del MusicPlayer.
import { EQ_BANDS } from './effects/equalizer';

export const DEFAULTS = {
  eqGains: EQ_BANDS.map(() => 0), // 0 dB → curva plana (sin coloración)
  compThreshold: -24,              // dB sobre el que el compresor empieza a actuar
  compRatio: 4,                    // 4:1 → compresión moderada
  reverbMix: 0,                    // 0 = sin reverb (señal seca) · 100 = solo reverb
  reverbDecay: 2,                  // segundos que tarda la cola en apagarse
  pan: 0,                          // 0 = centro estéreo
  width: 1,                        // 1 = estéreo normal
  volume: 100,                     // 100 = ganancia unidad (nivel original)
};
