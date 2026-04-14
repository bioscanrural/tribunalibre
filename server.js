// server.js — TRIBUNALIBRE Backend completo
require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const crypto     = require('crypto');
const Parser     = require('rss-parser');

const Post = require('./models/Post');
const User = require('./models/User');

const app    = express();
const parser = new Parser({
  timeout: 12000,
  headers: { 'User-Agent': 'TribunaLibre/1.0 (+https://tribunalibre.github.io)' },
  customFields: { item: ['media:content','media:thumbnail','enclosure','content:encoded'] },
});

/* ── MIDDLEWARE ─────────────────────────────────── */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, message: { error: 'Demasiadas solicitudes.' } }));

/* ── DB ─────────────────────────────────────────── */
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tribunalibre')
  .then(() => {
    console.log('✅ MongoDB conectado');
    // Primer import al arrancar si la DB está vacía
    Post.countDocuments().then(n => {
      if (n === 0) {
        console.log('📡 DB vacía — importando noticias iniciales...');
        runImport();
      }
    });
    startCron();
  })
  .catch(err => console.error('❌ MongoDB:', err.message));

/* ── JWT HELPERS ────────────────────────────────── */
const JWT_SECRET  = process.env.JWT_SECRET || 'tribuna_libre_secret_2025_cambiar';
const signToken   = id => jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
const authMiddle  = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No autorizado.' });
    const { id } = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(id);
    if (!req.user || req.user.isBanned) return res.status(401).json({ error: 'Sin acceso.' });
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido.' });
  }
};

/* ═══════════════════════════════════════════════════
   ROUTES — AUTH
═══════════════════════════════════════════════════ */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Faltan datos.' });
    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(400).json({ error: 'Email o usuario ya existe.' });
    const user = await User.create({ username, email, password, displayName: displayName || username });
    res.status(201).json({ token: signToken(user._id), user: user.toPublic() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
    if (user.isBanned) return res.status(403).json({ error: 'Cuenta suspendida.' });
    res.json({ token: signToken(user._id), user: user.toPublic() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', authMiddle, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

// Firebase UID sync (para cuando usás Firebase Auth en el frontend)
app.post('/api/auth/firebase-sync', async (req, res) => {
  try {
    const { uid, email, displayName } = req.body;
    let user = await User.findOne({ firebaseUid: uid });
    if (!user) {
      const username = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_') + '_' + Date.now().toString().slice(-4);
      user = await User.create({
        username, email, password: crypto.randomBytes(16).toString('hex'),
        displayName: displayName || username, firebaseUid: uid,
      });
    }
    res.json({ token: signToken(user._id), user: user.toPublic() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════
   ROUTES — NEWS
═══════════════════════════════════════════════════ */
// GET /api/news — listado principal
app.get('/api/news', async (req, res) => {
  try {
    const {
      page = 1, limit = 20,
      category, search, feed,
      sort = '-publishedAt'
    } = req.query;

    const filter = { status: 'published' };
    if (category) filter.category = category;
    if (feed)     filter['meta.sourceFeed'] = feed;
    if (search)   filter.$text = { $search: search };

    const [posts, total] = await Promise.all([
      Post.find(filter)
          .sort(sort)
          .skip((+page - 1) * +limit)
          .limit(+limit)
          .select('title excerpt category tags publishedAt coverImage meta aiSummary')
          .lean(),
      Post.countDocuments(filter),
    ]);

    res.json({
      posts,
      pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total / +limit) },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/news/:id
app.get('/api/news/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).lean();
    if (!post) return res.status(404).json({ error: 'Noticia no encontrada.' });
    res.json({ post });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/news/categories — categorías disponibles
app.get('/api/categories', async (req, res) => {
  try {
    const cats = await Post.distinct('category', { status: 'published' });
    res.json({ categories: cats.sort() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════
   ROUTES — COMMENTS
═══════════════════════════════════════════════════ */
// Schema inline simple (expandible)
const commentSchema = new mongoose.Schema({
  post:    { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  author:  { type: String, required: true },   // nombre del usuario o 'Invitado'
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  content: { type: String, required: true, maxlength: 1000 },
  likes:   { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });
const Comment = mongoose.models.Comment || mongoose.model('Comment', commentSchema);

app.get('/api/comments', async (req, res) => {
  try {
    const { post, page = 1, limit = 20 } = req.query;
    if (!post) return res.status(400).json({ error: 'post requerido.' });
    const comments = await Comment.find({ post, isDeleted: false })
      .sort('-createdAt').skip((+page-1)*+limit).limit(+limit).lean();
    res.json({ comments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/comments', async (req, res) => {
  try {
    const { post, content, author = 'Invitado' } = req.body;
    if (!post || !content?.trim()) return res.status(400).json({ error: 'Faltan datos.' });
    // Moderación básica
    const BANNED = ['spam','publicidad'];
    if (BANNED.some(w => content.toLowerCase().includes(w)))
      return res.status(400).json({ error: 'Comentario rechazado por moderación.' });
    const comment = await Comment.create({ post, content: content.trim(), author });
    // Suma puntos si hay token
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const { id } = jwt.verify(token, JWT_SECRET);
        await User.findByIdAndUpdate(id, { $inc: { rep: 5 } });
      } catch {}
    }
    res.status(201).json({ comment });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════
   ROUTES — ADMIN
═══════════════════════════════════════════════════ */
// Trigger import manual
app.post('/api/admin/import', async (req, res) => {
  // En prod agregar authMiddle + requireRole('admin')
  const key = req.headers['x-admin-key'];
  if (key !== (process.env.ADMIN_KEY || 'tribuna2025')) return res.status(403).json({ error: 'Sin acceso.' });
  try {
    const result = await runImport();
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/stats', async (req, res) => {
  const key = req.headers['x-admin-key'];
  if (key !== (process.env.ADMIN_KEY || 'tribuna2025')) return res.status(403).json({ error: 'Sin acceso.' });
  const [total, published, draft, users] = await Promise.all([
    Post.countDocuments(),
    Post.countDocuments({ status: 'published' }),
    Post.countDocuments({ status: 'draft' }),
    User.countDocuments(),
  ]);
  res.json({ total, published, draft, users });
});

/* ═══════════════════════════════════════════════════
   RSS FETCHER — integrado en el servidor
═══════════════════════════════════════════════════ */
const RSS_FEEDS = [
  { id: 'tyc',      name: 'TyC Sports',        url: 'https://www.tycsports.com/feed.xml',                    cat: 'Fútbol'   },
  { id: 'ole',      name: 'Olé',                url: 'https://www.ole.com.ar/rss.xml',                        cat: 'Fútbol'   },
  { id: 'espn',     name: 'ESPN Argentina',     url: 'https://www.espn.com.ar/espn/rss/news',                 cat: 'Deportes' },
  { id: 'infobae',  name: 'Infobae Deportes',   url: 'https://www.infobae.com/feeds/deportes.xml',            cat: 'Deportes' },
  { id: 'lanacion', name: 'La Nación Deportes', url: 'https://www.lanacion.com.ar/arcio/rss/',                cat: 'Deportes' },
  { id: 'p12',      name: 'Página 12 Deportes', url: 'https://www.pagina12.com.ar/rss/secciones/deportes',    cat: 'Deportes' },
  { id: 'bbc',      name: 'BBC Sport',          url: 'http://feeds.bbci.co.uk/sport/rss.xml',                 cat: 'Deportes' },
  { id: 'marca',    name: 'Marca',              url: 'https://e00-marca.uecdn.es/rss/portada.xml',            cat: 'Fútbol'   },
];

const KEYWORDS = {
  'Fútbol':        ['fútbol','futbol','gol','river','boca','selección','argentina','liga','champions','copa'],
  'Rugby':         ['rugby','pumas','scrum','try','all blacks','uar'],
  'Tenis':         ['tenis','atp','wta','roland','wimbledon','cerúndolo','etcheverry'],
  'Automovilismo': ['fórmula','formula 1','f1','colapinto','mónaco','indycar'],
  'Básquet':       ['básquet','basquet','nba','vildoza','liga nacional'],
};

function detectCategory(text) {
  const t = (text || '').toLowerCase();
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    if (kws.some(k => t.includes(k))) return cat;
  }
  return 'Deportes';
}

function makeSlug(title) {
  return title
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').slice(0, 80)
    + '-' + Date.now();
}

function extractImage(item) {
  return item['media:content']?.['$']?.url
      || item['media:thumbnail']?.['$']?.url
      || item.enclosure?.url
      || null;
}

function cleanHtml(str = '') {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 3000);
}

async function fetchOneFeed(feed) {
  const result = { new: 0, skip: 0, errors: 0 };
  try {
    const rss = await parser.parseURL(feed.url);
    for (const item of (rss.items || []).slice(0, 20)) {
      const title = item.title?.trim();
      if (!title || title.length < 10) continue;

      const hash = crypto.createHash('md5').update(title.toLowerCase()).digest('hex');
      const exists = await Post.findOne({ 'meta.hash': hash });
      if (exists) { result.skip++; continue; }

      const rawContent = cleanHtml(item['content:encoded'] || item.content || item.summary || '');
      const excerpt    = item.contentSnippet?.slice(0, 280) || rawContent.slice(0, 280);
      const category   = detectCategory(title + ' ' + rawContent);
      const image      = extractImage(item);

      // Si tenés ANTHROPIC_API_KEY, el resumen se genera; si no, usa el excerpt
      let aiSummary = excerpt;
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          const Anthropic = require('@anthropic-ai/sdk');
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const msg = await client.messages.create({
            model: 'claude-haiku-4-5-20251001', max_tokens: 120,
            messages: [{ role: 'user', content: `Resumí en máx 60 palabras (español, tono periodístico): ${title}. ${rawContent.slice(0,500)}` }],
          });
          aiSummary = msg.content[0].text.trim();
        } catch { /* sin IA, usa excerpt */ }
      }

      try {
        await Post.create({
          title,
          slug:       makeSlug(title),
          content:    rawContent || excerpt,
          excerpt:    aiSummary || excerpt,
          coverImage: image,
          category,
          tags:       [feed.id, category.toLowerCase()],
          status:     'published',
          publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
          aiSummary,
          meta: {
            hash,
            sourceFeed: feed.id,
            sourceName: feed.name,
            sourceUrl:  item.link || '',
            aiScore:    70,
            importedAt: new Date(),
          },
        });
        result.new++;
      } catch (e) {
        if (!e.code || e.code !== 11000) result.errors++; // 11000 = duplicate key
        else result.skip++;
      }
    }
  } catch (e) {
    console.error(`  ❌ ${feed.name}: ${e.message}`);
    result.errors++;
  }
  return result;
}

async function runImport() {
  console.log(`\n📡 Import RSS — ${new Date().toLocaleString('es-AR')}`);
  let total = { new: 0, skip: 0, errors: 0 };
  for (const feed of RSS_FEEDS) {
    process.stdout.write(`  → ${feed.name}...`);
    const r = await fetchOneFeed(feed);
    console.log(` ✓ ${r.new} nuevas, ${r.skip} dup, ${r.errors} err`);
    total.new    += r.new;
    total.skip   += r.skip;
    total.errors += r.errors;
    await new Promise(resolve => setTimeout(resolve, 1200)); // respetar rate limits
  }
  console.log(`\n✅ Total: ${total.new} nuevas | ${total.skip} duplicadas | ${total.errors} errores\n`);
  return total;
}

/* ═══════════════════════════════════════════════════
   CRON — import cada 15 minutos
═══════════════════════════════════════════════════ */
function startCron() {
  const INTERVAL_MS = parseInt(process.env.RSS_INTERVAL_MINUTES || '15') * 60 * 1000;
  console.log(`⏰ Cron activo: importando cada ${INTERVAL_MS / 60000} minutos`);
  setInterval(() => {
    runImport().catch(e => console.error('Cron error:', e.message));
  }, INTERVAL_MS);
}

/* ── HEALTH ─────────────────────────────────────── */
app.get('/api/health', async (req, res) => {
  const count = await Post.countDocuments({ status: 'published' }).catch(() => 0);
  res.json({
    status:   'ok',
    service:  'TribunaLibre API v1',
    posts:    count,
    db:       mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time:     new Date().toISOString(),
  });
});

app.get('/', (req, res) => res.json({ message: 'TribunaLibre API funcionando ✅' }));

/* ── START ─────────────────────────────────────── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🏟️  TribunaLibre API → http://localhost:${PORT}`);
  console.log(`📋 Endpoints disponibles:`);
  console.log(`   GET  /api/health`);
  console.log(`   GET  /api/news`);
  console.log(`   GET  /api/news?page=1&limit=20&category=Fútbol`);
  console.log(`   GET  /api/news/:id`);
  console.log(`   GET  /api/categories`);
  console.log(`   GET  /api/comments?post=ID`);
  console.log(`   POST /api/comments`);
  console.log(`   POST /api/auth/register`);
  console.log(`   POST /api/auth/login`);
  console.log(`   POST /api/auth/firebase-sync`);
  console.log(`   POST /api/admin/import  (x-admin-key requerido)\n`);
});

module.exports = app;
