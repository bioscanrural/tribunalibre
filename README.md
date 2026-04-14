# 🏟️ TRIBUNALIBRE — Setup Completo

## Estructura del proyecto

```
tribunalibre/
├── index.html          ← Frontend (va a GitHub Pages)
├── server.js           ← Backend Express completo
├── package.json
├── .env.example
├── models/
│   ├── Post.js
│   └── User.js
└── scripts/
    └── seed-admin.js
```

---

## 1. BACKEND — Correr localmente

### Requisitos
- Node.js 18+
- MongoDB local **o** cuenta gratis en [MongoDB Atlas](https://cloud.mongodb.com)

### Instalación

```bash
# Clonar o descargar los archivos
cd tribunalibre

# Instalar dependencias
npm install

# Crear .env
cp .env.example .env
# Editar .env con tu MONGODB_URI y opcionalmente ANTHROPIC_API_KEY
nano .env
```

### Arrancar

```bash
# Crear usuario admin (solo la primera vez)
npm run seed-admin

# Iniciar servidor (importa RSS automáticamente al arrancar si la DB está vacía)
node server.js

# En desarrollo con hot-reload:
npm run dev
```

El servidor corre en **http://localhost:3000**

### Trigger import manual (sin esperar el cron)
```bash
curl -X POST http://localhost:3000/api/admin/import \
  -H "x-admin-key: tribuna2025"
```

---

## 2. FRONTEND — Abrir localmente

```bash
# Con live-server:
npx live-server .

# O simplemente abrir index.html en el navegador
# El frontend ya apunta a http://localhost:3000 por defecto
```

---

## 3. FIREBASE AUTH (opcional pero recomendado)

1. Ir a **https://console.firebase.google.com**
2. Crear proyecto → Agregar app web
3. Copiar la config y reemplazar en `index.html`:

```javascript
const firebaseConfig = {
  apiKey:            "tu-api-key",
  authDomain:        "tu-proyecto.firebaseapp.com",
  projectId:         "tu-proyecto",
  storageBucket:     "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123",
};
```

4. En Firebase Console → Authentication → Sign-in methods → Habilitar **Email/Password** y **Google**

---

## 4. DEPLOY EN PRODUCCIÓN

### Frontend → GitHub Pages

```bash
# En tu repo, ir a Settings → Pages
# Source: Deploy from branch → main → / (root)
# El index.html se sirve automáticamente

# Antes de subir, cambiar en index.html:
# window.API_URL = 'https://TU-BACKEND.railway.app';
```

### Backend → Railway (gratuito hasta cierto límite)

```bash
# 1. Crear cuenta en railway.app
# 2. New Project → Deploy from GitHub Repo
# 3. Seleccionar la carpeta del backend
# 4. En Variables agregar:
#    MONGODB_URI   = mongodb+srv://...
#    JWT_SECRET    = clave_muy_larga
#    ADMIN_KEY     = tu_clave_admin
#    CORS_ORIGIN   = https://TU-USUARIO.github.io
#    ANTHROPIC_API_KEY = sk-ant-... (opcional)
# 5. Railway detecta package.json y corre npm start
```

### Backend → Render (alternativa gratuita)

```bash
# render.com → New Web Service → conectar GitHub
# Build Command: npm install
# Start Command: node server.js
# Variables: igual que Railway
```

### Base de datos → MongoDB Atlas (gratuita)

```bash
# cloud.mongodb.com → Create Free Cluster (M0)
# Database Access → Add user
# Network Access → Allow 0.0.0.0/0
# Connect → Drivers → copiar connection string
# MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/tribunalibre
```

---

## 5. VARIABLES DE ENTORNO DE PRODUCCIÓN

```env
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/tribunalibre
JWT_SECRET=una_clave_secreta_muy_larga_y_aleatoria_min_32_chars
ADMIN_KEY=clave_admin_segura
CORS_ORIGIN=https://bioscanrural.github.io
RSS_INTERVAL_MINUTES=15
ANTHROPIC_API_KEY=sk-ant-...  # opcional
```

---

## 6. ENDPOINTS DISPONIBLES

```
GET  /api/health                    → Status del servidor
GET  /api/news                      → Noticias (paginado)
GET  /api/news?category=Fútbol      → Por categoría
GET  /api/news?search=river         → Búsqueda
GET  /api/news?page=2&limit=20      → Paginación
GET  /api/news/:id                  → Noticia individual
GET  /api/categories                → Categorías disponibles
GET  /api/comments?post=ID          → Comentarios de una nota
POST /api/comments                  → Agregar comentario
POST /api/auth/register             → Registrar usuario
POST /api/auth/login                → Iniciar sesión
GET  /api/auth/me                   → Perfil (requiere JWT)
POST /api/auth/firebase-sync        → Sync con Firebase
POST /api/admin/import              → Import RSS manual
GET  /api/admin/stats               → Estadísticas
```

---

## 7. RSS FEEDS INCLUIDOS

| Feed | URL |
|------|-----|
| TyC Sports | https://www.tycsports.com/feed.xml |
| Olé | https://www.ole.com.ar/rss.xml |
| ESPN Argentina | https://www.espn.com.ar/espn/rss/news |
| Infobae Deportes | https://www.infobae.com/feeds/deportes.xml |
| La Nación | https://www.lanacion.com.ar/arcio/rss/ |
| Página 12 | https://www.pagina12.com.ar/rss/secciones/deportes |
| BBC Sport | http://feeds.bbci.co.uk/sport/rss.xml |
| Marca | https://e00-marca.uecdn.es/rss/portada.xml |

Importa automáticamente cada **15 minutos** (configurable en `.env`).

---

## 8. FLUJO COMPLETO

```
RSS Feeds (cada 15 min)
    ↓
server.js (fetchOneFeed)
    ↓
Dedup por hash MD5
    ↓
Claude API (resumen, si está configurado)
    ↓
MongoDB (Post guardado)
    ↓
GET /api/news
    ↓
index.html (React, muestra noticias reales)
```

---

## 9. PRÓXIMAS MEJORAS SUGERIDAS

- **WebSocket** para chat en vivo (socket.io)
- **Scores en vivo** con api-football.com (plan gratis disponible)
- **Notificaciones push** con Firebase Cloud Messaging
- **CDN de imágenes** con Cloudinary (plan free)
- **Columnas de periodistas** con editor rico (Quill.js)
- **SEO** con sitemap.xml generado automáticamente
- **PWA** con service worker para funcionar offline

---

🇦🇷 **TRIBUNALIBRE** — Hecho con pasión por el deporte argentino
