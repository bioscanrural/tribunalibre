// ═══════════════════════════════════════════════════════
//  TRIBUNALIBRE v4 — IA REAL con Claude API
//  Reemplaza todas las funciones simuladas
// ═══════════════════════════════════════════════════════
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

// ── 1. RESUMEN DE NOTICIAS ──────────────────────────────
async function summarizeNews(title, content, maxWords = 60) {
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 200,
    messages: [{ role: 'user', content:
      `Sos editor deportivo argentino. Resumí esta noticia en ${maxWords} palabras máximo, tono directo y apasionado. Solo el resumen.\n\nTÍTULO: ${title}\nCONTENIDO: ${content.substring(0,2000)}`
    }]
  });
  return msg.content[0].text.trim();
}

// ── 2. REESCRITURA SEO ──────────────────────────────────
async function rewriteTitle(originalTitle, category) {
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 80,
    messages: [{ role: 'user', content:
      `Reescribí este título deportivo para SEO. Máximo 80 chars. Solo el título, sin comillas.\nCategoría: ${category}\nOriginal: ${originalTitle}`
    }]
  });
  return msg.content[0].text.trim();
}

// ── 3. GENERAR ENCUESTA VAR ─────────────────────────────
async function generatePoll(title, content) {
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 250,
    messages: [{ role: 'user', content:
      `Generá una encuesta polémica para el foro deportivo argentino TRIBUNALIBRE. Solo JSON válido:\n{"question":"...","options":["...","...","..."],"type":"var|opinion|prediction"}\n\nNOTICIA: ${title}\n${(content||'').substring(0,400)}`
    }]
  });
  return JSON.parse(msg.content[0].text.replace(/```json?|```/g,'').trim());
}

// ── 4. MODERAR COMENTARIO ───────────────────────────────
async function moderateComment(text) {
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 120,
    messages: [{ role: 'user', content:
      `Moderá este comentario de un sitio deportivo argentino. Solo JSON:\n{"approved":true/false,"toxicityScore":0.0-1.0,"reason":null}\n\nCOMENTARIO: "${text}"`
    }]
  });
  return JSON.parse(msg.content[0].text.replace(/```json?|```/g,'').trim());
}

// ── 5. TAGS AUTOMÁTICOS ─────────────────────────────────
async function generateTags(title, content) {
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 80,
    messages: [{ role: 'user', content:
      `Generá 3-5 tags para esta noticia deportiva argentina. Solo JSON array: ["tag1","tag2"]\nNOTICIA: ${title}. ${(content||'').substring(0,200)}`
    }]
  });
  return JSON.parse(msg.content[0].text.replace(/```json?|```/g,'').trim());
}

// ── 6. SCORING DE RELEVANCIA ────────────────────────────
async function scoreRelevance(title) {
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 60,
    messages: [{ role: 'user', content:
      `Para el sitio deportivo argentino TRIBUNALIBRE, puntuá del 0 al 100 esta noticia según relevancia para la audiencia argentina. Solo JSON: {"score":85,"reason":"..."}\nNOTICIA: ${title}`
    }]
  });
  return JSON.parse(msg.content[0].text.replace(/```json?|```/g,'').trim());
}

// ── 7. DETECTAR JUGADA POLÉMICA ─────────────────────────
async function detectControversy(matchTitle, matchContent) {
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 200,
    messages: [{ role: 'user', content:
      `Analizá si esta nota de fútbol tiene jugadas polémicas para una encuesta "El VAR". Solo JSON:\n{"hasControversy":true/false,"controversyType":"penal|tarjeta|gol_anulado|null","suggestedPoll":{"question":"...","options":["...","...","..."]}}\n\nPARTIDO: ${matchTitle}\n${(matchContent||'').substring(0,500)}`
    }]
  });
  return JSON.parse(msg.content[0].text.replace(/```json?|```/g,'').trim());
}

// ── 8. DIGEST DIARIO ────────────────────────────────────
async function generateDailyDigest(newsArray) {
  const headlines = newsArray.map((n,i) => `${i+1}. ${n.title}`).join('\n');
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 400,
    messages: [{ role: 'user', content:
      `Sos el editor jefe de TRIBUNALIBRE. Con estas noticias del día, escribí un resumen de 120 palabras máximo, estilo periodístico apasionado. Solo el texto.\n\nNOTICIAS:\n${headlines}`
    }]
  });
  return msg.content[0].text.trim();
}

/*
── USO EN RUTAS EXPRESS ──────────────────────────────────

// En POST /api/comments (moderar antes de guardar):
const mod = await moderateComment(req.body.content);
if (!mod.approved) return res.status(400).json({ error: mod.reason || 'Comentario inapropiado' });

// En POST /api/posts (enriquecer con IA):
const [summary, tags, relevance] = await Promise.all([
  summarizeNews(title, content),
  generateTags(title, content),
  scoreRelevance(title),
]);

// Al importar desde RSS (detectar polémica):
const controversy = await detectControversy(news.title, news.content);
if (controversy.hasControversy) {
  await Poll.create({ question: controversy.suggestedPoll.question, ... });
}
*/

module.exports = { summarizeNews, rewriteTitle, generatePoll, moderateComment, generateTags, scoreRelevance, detectControversy, generateDailyDigest };
