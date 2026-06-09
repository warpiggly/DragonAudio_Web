import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import API from '../api';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API}/auth/login`, { email, password, name: '' });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/music');
    } catch {
      setError('Credenciales incorrectas');
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

            <form onSubmit={handleLogin} className="login-form">
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
              <button type="submit" className="login-btn">Entrar</button>
            </form>

            <p className="login-register">
              ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
