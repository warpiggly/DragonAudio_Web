import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import AudioTest from './pages/AudioTest';
import MusicPlayer from './pages/MusicPlayer';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/test" element={<AudioTest />} />
        <Route path="/music" element={<MusicPlayer />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;