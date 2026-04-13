// ═══════════════════════════════════════════════════════
//  TRIBUNALIBRE v4 — RSS Fetcher Automático
// ═══════════════════════════════════════════════════════
const Parser = require('rss-parser');
const crypto = require('crypto');
const parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'TRIBUNALIBRE/4.0' } });

const FEEDS = [
  { id:'espn', name:'ESPN Deportes', url:'https://espndeportes.espn.com/rss/noticias', category:'Fútbol', active:true },
  { id:'tyc',  name:'TyC Sports',   url:'https://www.tycsports.com/feed.xml',         category:'Fútbol', active:true },
  { id:'ole',  name:'Olé',          url:'https://www.ole.com.ar/rss.xml',             category:'Fútbol', active:true },
  { id:'infobae', name:'Infobae Deportes', url:'https://www.infobae.com/feeds/deportes.xml', category:'Deportes', active:true },
];

const KEYWORD_MAP = {
  'Fútbol':['fútbol','futbol','gol','river','boca','selección','mundial'],
  'Rugby': ['rugby','pumas','try','all blacks'],
  'Tenis': ['tenis','atp','wta','cerundolo'],
  'Automovilismo': ['f1','fórmula','colapinto','mónaco'],
  'Básquet': ['basquet','nba','vildoza'],
};

function detectCategory(text) {
  const t = text.toLowerCase();
  for (const [cat, kws] of Object.entries(KEYWORD_MAP)) if (kws.some(k => t.includes(k))) return cat;
  return 'Fútbol';
}

async function fetchFeed(feed) {
  const { Post, Category, User } = require('./models');
  const ai = require('./ai');
  const results = { new: 0, skip: 0 };
  try {
    const rss = await parser.parseURL(feed.url);
    const bot = await User.findOne({ role: 'admin' });
    const cat = await Category.findOne({ name: feed.category }) || await Category.create({ name: feed.category, slug: feed.category.toLowerCase(), emoji: '⚽' });
    for (const item of rss.items.slice(0, 15)) {
      const title = item.title?.trim();
      if (!title) continue;
      const hash = crypto.createHash('md5').update(title.toLowerCase()).digest('hex');
      if (await Post.findOne({ 'meta.hash': hash })) { results.skip++; continue; }
      const content = (item['content:encoded'] || item.content || item.summary || '').replace(/<[^>]+>/g,' ').trim().substring(0,3000);
      const [summary, tags, relevance] = await Promise.allSettled([
        ai.summarizeNews(title, content),
        ai.generateTags(title, content),
        ai.scoreRelevance(title),
      ]);
      const slug = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,'-').slice(0,80) + '-' + Date.now();
      await Post.create({
        title, slug, content: content || title,
        excerpt: summary.value || content.substring(0,200),
        author: bot._id, category: cat._id,
        tags: tags.value || [],
        status: (relevance.value?.score || 0) >= 85 ? 'published' : 'draft',
        publishedAt: (relevance.value?.score || 0) >= 85 ? new Date() : null,
        aiSummary: summary.value,
        meta: { hash, sourceFeed: feed.id, sourceName: feed.name, sourceUrl: item.link, aiScore: relevance.value?.score || 50, importedAt: new Date() },
      });
      results.new++;
    }
  } catch(e) { console.error(`Feed error (${feed.name}):`, e.message); }
  return results;
}

async function runImport() {
  let total = { new: 0, skip: 0 };
  for (const feed of FEEDS.filter(f => f.active)) {
    const r = await fetchFeed(feed);
    total.new += r.new; total.skip += r.skip;
    await new Promise(r => setTimeout(r, 1500)); // rate limit
  }
  console.log(`✅ Import: ${total.new} nuevas, ${total.skip} duplicadas`);
  return total;
}

module.exports = { runImport, FEEDS };

// ═══════════════════════════════════════════════════════
//  CRON JOBS
// ═══════════════════════════════════════════════════════
/*
const cron = require('node-cron');

// RSS cada 10 min
cron.schedule('*\/10 * * * *', async () => {
  console.log('📡 Importing RSS...');
  await runImport();
}, { timezone: 'America/Argentina/Buenos_Aires' });

// Auto-publicar noticias de alta relevancia cada 30 min
cron.schedule('*\/30 * * * *', async () => {
  const { Post } = require('./models');
  const posts = await Post.find({ status:'draft', 'meta.aiScore': { $gte: 85 } }).limit(5);
  for (const p of posts) { p.status = 'published'; p.publishedAt = new Date(); await p.save(); }
  if (posts.length) console.log(`🟢 Auto-publicados ${posts.length} posts`);
}, { timezone: 'America/Argentina/Buenos_Aires' });

// Digest diario 8 AM
cron.schedule('0 8 * * *', async () => {
  const { Post } = require('./models');
  const today = new Date(); today.setDate(today.getDate() - 1);
  const news = await Post.find({ status:'published', publishedAt: { $gte: today } }).limit(8);
  if (news.length) { const digest = await require('./ai').generateDailyDigest(news); console.log('📋 Digest:', digest.slice(0,80)); }
}, { timezone: 'America/Argentina/Buenos_Aires' });
*/

// ═══════════════════════════════════════════════════════
//  AUTH ROUTES con email + Google + invitado
// ═══════════════════════════════════════════════════════
/*
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { User } = require('./models');
const signToken = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, email, password, displayName } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Campos requeridos.' });
  if (await User.findOne({ $or: [{ email }, { username }] })) return res.status(400).json({ error: 'Usuario o email ya existe.' });
  const user = await User.create({ username, email, password, displayName: displayName || username });
  res.status(201).json({ token: signToken(user._id), user: user.toPublic() });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await user.matchPassword(password))) return res.status(401).json({ error: 'Credenciales inválidas.' });
  if (user.isBanned) return res.status(403).json({ error: 'Cuenta suspendida.' });
  res.json({ token: signToken(user._id), user: user.toPublic() });
});

// POST /api/auth/guest — Token temporal de invitado
router.post('/guest', (req, res) => {
  const guestToken = jwt.sign({ id: 'guest_' + Date.now(), role: 'guest' }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token: guestToken, user: { id: null, username: 'Invitado', role: 'guest', isGuest: true } });
});

// POST /api/auth/google — OAuth con Google
router.post('/google', async (req, res) => {
  // Verificar token de Google con google-auth-library
  // const { OAuth2Client } = require('google-auth-library');
  // const ticket = await client.verifyIdToken({ idToken: req.body.token, audience: GOOGLE_CLIENT_ID });
  // const { email, name, picture } = ticket.getPayload();
  // ...buscar o crear usuario...
  res.json({ message: 'Integrar con google-auth-library' });
});

module.exports = router;
*/
