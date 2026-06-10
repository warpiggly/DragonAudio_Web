// ════════════════════════════════════════════════════════════════════════
//  Ecualizaciones temáticas ("presets") para el MusicPlayer.
//
//  Son las curvas de ai/data/raw/Eqs_audio.json, pero adaptadas a las
//  9 bandas reales del ecualizador del frontend (EQ_BANDS en MusicPlayer.js):
//      31 · 63 · 125 · 250 · 500 · 1k · 2k · 4k · 8k
//
//  El JSON original trae 10 puntos (31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k).
//  Mapeo:
//    · 62 Hz  -> banda 63 (mismo punto, redondeo de etiqueta)
//    · 16 kHz -> se FUNDE con 8 kHz: la banda 8k del front es un highshelf, así
//      que cubre todo lo que está por encima. Promediamos 8k y 16k para no
//      perder el aire de los agudos.
//
//  Cada preset es una curva que el usuario puede SUMAR encima de la curva de su
//  test+IA (o usar sola). La suma final se recorta a ±12 dB en MusicPlayer.
// ════════════════════════════════════════════════════════════════════════

// Orden EXACTO de las 9 bandas del ecualizador del frontend.
export const FRONT_BANDS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000];

// Convierte el objeto eq de 10 puntos del JSON en el array de 9 ganancias.
const toGains = (eq) => [
  eq[31], eq[62], eq[125], eq[250], eq[500],
  eq[1000], eq[2000], eq[4000],
  Math.round((eq[8000] + eq[16000]) / 2),
];

// Datos crudos (id, nombre, categoría, para-qué-sirve y la curva de 10 puntos).
// Se omite el campo "prompt" del JSON: no se usa para ecualizar.
const RAW = [
  { id: 'harman_neutral', name: 'Harman Neutral', category: 'Referencia', purpose: 'Sonido equilibrado y natural (curva Harman).', best_for: ['Todo género', 'Uso diario'], eq: { 31: 3, 62: 3, 125: 2, 250: 0, 500: 0, 1000: 0, 2000: 1, 4000: 1, 8000: 1, 16000: 0 } },
  { id: 'harman_warm', name: 'Harman Warm', category: 'Referencia', purpose: 'Escucha cálida y relajada, poca fatiga.', best_for: ['Jazz', 'Acústico', 'Sesiones largas'], eq: { 31: 5, 62: 4, 125: 3, 250: 1, 500: 0, 1000: 0, 2000: -1, 4000: 0, 8000: 0, 16000: -1 } },
  { id: 'harman_bright', name: 'Harman Bright', category: 'Referencia', purpose: 'Máxima claridad y detalle.', best_for: ['Escucha crítica', 'Clásica'], eq: { 31: 2, 62: 2, 125: 1, 250: 0, 500: 0, 1000: 0, 2000: 2, 4000: 3, 8000: 2, 16000: 1 } },
  { id: 'vocal_clarity', name: 'Vocal Clarity', category: 'Voz', purpose: 'Mejora la inteligibilidad de la voz.', best_for: ['Podcasts', 'Voces', 'Reuniones'], eq: { 31: -4, 62: -3, 125: -2, 250: -1, 500: 0, 1000: 2, 2000: 4, 4000: 5, 8000: 3, 16000: 1 } },
  { id: 'podcast_studio', name: 'Podcast Studio', category: 'Voz', purpose: 'Voz estilo locución/radio.', best_for: ['Podcasts', 'Audiolibros'], eq: { 31: -6, 62: -4, 125: -2, 250: 0, 500: 1, 1000: 2, 2000: 3, 4000: 4, 8000: 2, 16000: 0 } },
  { id: 'edm_festival', name: 'EDM Festival', category: 'Electrónica', purpose: 'Sonido de festival: graves potentes y agudos brillantes.', best_for: ['EDM', 'House'], eq: { 31: 6, 62: 5, 125: 3, 250: 0, 500: -1, 1000: -1, 2000: 0, 4000: 2, 8000: 3, 16000: 2 } },
  { id: 'edm_club', name: 'EDM Club', category: 'Electrónica', purpose: 'Presión de graves estilo discoteca.', best_for: ['EDM', 'Techno', 'Dance'], eq: { 31: 8, 62: 6, 125: 3, 250: 0, 500: -2, 1000: -2, 2000: -1, 4000: 1, 8000: 2, 16000: 1 } },
  { id: 'deep_bass', name: 'Deep Bass', category: 'Electrónica', purpose: 'Máximo impacto de graves y sub-graves.', best_for: ['Bass', 'Dubstep', 'Trap'], eq: { 31: 10, 62: 7, 125: 4, 250: 1, 500: 0, 1000: 0, 2000: 0, 4000: 0, 8000: 0, 16000: 0 } },
  { id: 'hiphop_modern', name: 'Hip-Hop Modern', category: 'Música', purpose: 'Rap moderno: 808s, pegada y presencia vocal.', best_for: ['Hip-Hop', 'Rap', 'Urbano'], eq: { 31: 7, 62: 5, 125: 3, 250: 0, 500: 0, 1000: 1, 2000: 2, 4000: 1, 8000: 1, 16000: 0 } },
  { id: 'trap', name: 'Trap', category: 'Música', purpose: 'Graves profundos con voces nítidas.', best_for: ['Trap', 'Drill'], eq: { 31: 8, 62: 6, 125: 3, 250: 0, 500: -1, 1000: 0, 2000: 2, 4000: 2, 8000: 1, 16000: 0 } },
  { id: 'rock_classic', name: 'Rock Classic', category: 'Música', purpose: 'Realza guitarras e instrumentos en vivo.', best_for: ['Rock', 'Classic Rock'], eq: { 31: 1, 62: 2, 125: 2, 250: 1, 500: 0, 1000: 1, 2000: 2, 4000: 3, 8000: 1, 16000: 0 } },
  { id: 'metal', name: 'Metal', category: 'Música', purpose: 'Reproducción agresiva y detallada.', best_for: ['Metal', 'Hard Rock'], eq: { 31: 3, 62: 4, 125: 3, 250: 0, 500: -1, 1000: 1, 2000: 3, 4000: 4, 8000: 2, 16000: 0 } },
  { id: 'pop_commercial', name: 'Pop Commercial', category: 'Música', purpose: 'Sonido moderno, pulido y emocionante.', best_for: ['Pop', 'Top 40'], eq: { 31: 4, 62: 4, 125: 2, 250: 0, 500: 0, 1000: 1, 2000: 2, 4000: 2, 8000: 2, 16000: 1 } },
  { id: 'jazz', name: 'Jazz', category: 'Referencia', purpose: 'Timbre natural y realista.', best_for: ['Jazz', 'Acústico'], eq: { 31: 0, 62: 1, 125: 1, 250: 1, 500: 1, 1000: 0, 2000: 0, 4000: 1, 8000: 1, 16000: 0 } },
  { id: 'classical', name: 'Classical', category: 'Referencia', purpose: 'Reproducción orquestal neutra.', best_for: ['Clásica', 'Orquesta'], eq: { 31: 0, 62: 0, 125: 0, 250: 0, 500: 0, 1000: 0, 2000: 0, 4000: 0, 8000: 0, 16000: 0 } },
  { id: 'gaming_fps', name: 'Gaming FPS', category: 'Gaming', purpose: 'Pasos y conciencia direccional.', best_for: ['FPS', 'Competitivo'], eq: { 31: -2, 62: -2, 125: -1, 250: 0, 500: 0, 1000: 2, 2000: 4, 4000: 5, 8000: 4, 16000: 2 } },
  { id: 'gaming_cinematic', name: 'Gaming Cinematic', category: 'Gaming', purpose: 'Experiencia inmersiva y emocional.', best_for: ['RPG', 'Aventura', 'Películas'], eq: { 31: 5, 62: 4, 125: 3, 250: 0, 500: 0, 1000: 0, 2000: 1, 4000: 1, 8000: 1, 16000: 0 } },
  { id: 'relax_chill', name: 'Relax Chill', category: 'Estilo', purpose: 'Escucha sin fatiga, máximo confort.', best_for: ['LoFi', 'Ambient', 'Estudio'], eq: { 31: 3, 62: 3, 125: 2, 250: 1, 500: 1, 1000: 0, 2000: -1, 4000: -1, 8000: 0, 16000: 0 } },
  { id: 'studio_monitor', name: 'Studio Monitor', category: 'Referencia', purpose: 'Análisis de mezcla, transparencia.', best_for: ['Mezcla', 'Análisis'], eq: { 31: 1, 62: 1, 125: 0, 250: 0, 500: 0, 1000: 0, 2000: 1, 4000: 1, 8000: 0, 16000: 0 } },
  { id: 'mastering_reference', name: 'Mastering Reference', category: 'Referencia', purpose: 'Evaluación crítica de masterización.', best_for: ['Masterización', 'Revisión final'], eq: { 31: 0, 62: 1, 125: 0, 250: 0, 500: 0, 1000: 0, 2000: 0, 4000: 0, 8000: 0, 16000: -1 } },
];

// Presets listos para consumir: cada uno con su array `gains` de 9 bandas.
export const EQ_PRESETS = RAW.map((p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  purpose: p.purpose,
  best_for: p.best_for,
  gains: toGains(p.eq),
}));

// Categorías únicas, en el orden en que aparecen (para los chips de filtro).
export const PRESET_CATEGORIES = [...new Set(EQ_PRESETS.map((p) => p.category))];

// Devuelve las 9 ganancias de un preset por id (o null si no existe).
export const getPresetGains = (id) => {
  const p = EQ_PRESETS.find((x) => x.id === id);
  return p ? p.gains : null;
};

// Combina una curva base (test/IA) con un preset y recorta a ±limit dB.
// base y preset son arrays de 9 valores; preset puede ser null (solo base).
export const combineGains = (base, presetId, limit = 12) => {
  const preset = presetId ? getPresetGains(presetId) : null;
  return base.map((b, i) => {
    const total = b + (preset ? preset[i] : 0);
    return Math.max(-limit, Math.min(limit, Math.round(total)));
  });
};
