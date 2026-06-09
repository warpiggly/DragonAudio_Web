import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import API from '../api';
import './Login.css';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/auth/register`, { name, email, password });
      navigate('/');
    } catch {
      setError('Error al registrar');
    }
  };

  return (
    <div className="login-page">
      <video className="login-video-bg" autoPlay muted playsInline loop>
        <source src="/videos/background.mp4" type="video/mp4" />
      </video>

      <div className="login-overlay" />

      <div className="login-container">
        <div className="login-card-glow">
          <div className="login-card">
            <div className="login-logo">
              <img src="/logo.png" alt="DragonAudio" className="logo-img" />
              <h1 className="login-title">DragonAudio</h1>
            </div>

            {error && <p className="login-error">{error}</p>}

            <form onSubmit={handleRegister} className="login-form">
              <input
                placeholder="Nombre" value={name}
                onChange={e => setName(e.target.value)}
                className="login-input"
              />
              <input
                type="email" placeholder="Email" value={email}
                onChange={e => setEmail(e.target.value)}
                className="login-input"
              />
              <input
                type="password" placeholder="Contraseña" value={password}
                onChange={e => setPassword(e.target.value)}
                className="login-input"
              />
              <button type="submit" className="login-btn">Registrarse</button>
            </form>

            <p className="login-register">
              ¿Ya tienes cuenta? <Link to="/">Inicia Sesión</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
