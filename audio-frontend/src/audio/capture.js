// ════════════════════════════════════════════════════════════════════════
//  CAPTURA — pide al usuario compartir una pestaña con audio y devuelve el
//  stream listo para conectar al AudioContext.
// ════════════════════════════════════════════════════════════════════════

// Error específico: el usuario compartió la pestaña pero sin marcar
// "Compartir audio de la pestaña". El MusicPlayer lo detecta por el code.
export const NO_AUDIO = 'NO_AUDIO';

// Captura pantalla + audio con los procesados del SO desactivados,
// para que la música llegue lo más limpia posible.
export async function captureTabAudio() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
      sampleRate: 48000,
      sampleSize: 16,
      // Silencia la reproducción local de la pestaña capturada: el usuario
      // solo oye la versión procesada del dragón, no la original a la vez.
      // Al detener (track.stop) la pestaña recupera su audio sola.
      suppressLocalAudioPlayback: true,
    },
  });

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    const err = new Error('No se compartió audio');
    err.code = NO_AUDIO;
    throw err;
  }

  // Reaplicamos restricciones ya sobre el track (algunos navegadores las ignoran en la solicitud).
  try {
    await audioTracks[0].applyConstraints({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
      suppressLocalAudioPlayback: true,
    });
  } catch (_) {}

  // Descartamos el video: solo necesitamos el audio. Ahorra GPU/CPU.
  stream.getVideoTracks().forEach((t) => t.stop());

  return {
    stream,                                      // stream completo (para detener todo al parar)
    audioStream: new MediaStream(audioTracks),   // solo audio (para createMediaStreamSource)
    audioTrack: audioTracks[0],                  // para escuchar el evento 'ended'
  };
}
