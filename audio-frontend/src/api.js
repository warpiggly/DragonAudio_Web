// URL base del backend.
// Por defecto es '' (vacío) => las peticiones son RELATIVAS al mismo origen
// que sirve la página. Así el MISMO código funciona en:
//   - local  (FastAPI sirve el build en http://localhost:8000)
//   - ngrok  (https://...ngrok-free.dev)
//   - AWS    (http(s)://tu-dominio-o-ip)
// Sin tener que cambiar nada de código.
//
// Si algún día necesitas apuntar a un backend en OTRO dominio, basta con
// crear un archivo .env con:  REACT_APP_API_URL=https://mi-backend.com
const API = process.env.REACT_APP_API_URL || '';

export default API;
