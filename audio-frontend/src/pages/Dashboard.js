import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 600, margin: '50px auto', padding: 20 }}>
      <h1>Hola, {user.name} 👋</h1>
      <div style={{ display: 'flex', gap: 15, marginTop: 20 }}>
        <button
          onClick={() => navigate('/test')}
          style={{ padding: '15px 30px', fontSize: 18 }}
        >
          🎧 Prueba de Audio
        </button>
        <button
          onClick={() => navigate('/music')}
          style={{ padding: '15px 30px', fontSize: 18 }}
        >
          🎵 Reproductor de Música
        </button>
      </div>
    </div>
  );
}