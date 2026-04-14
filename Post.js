// models/Post.js
const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true },
  content:     { type: String, default: '' },
  excerpt:     { type: String, default: '' },
  coverImage:  { type: String, default: null },
  category:    { type: String, default: 'Deportes' },
  tags:        [{ type: String }],
  status:      { type: String, enum: ['draft','published','archived'], default: 'published' },
  publishedAt: { type: Date, default: Date.now },
  aiSummary:   { type: String, default: null },
  meta: {
    hash:        String,   // MD5 del título para dedup
    sourceFeed:  String,   // 'tyc' | 'ole' | 'espn' etc.
    sourceName:  String,   // 'TyC Sports'
    sourceUrl:   String,   // URL original
    aiScore:     { type: Number, default: 50 },
    importedAt:  { type: Date, default: Date.now },
  },
}, { timestamps: true });

PostSchema.index({ 'meta.hash': 1 });
PostSchema.index({ publishedAt: -1 });
PostSchema.index({ category: 1, publishedAt: -1 });
PostSchema.index({ title: 'text', excerpt: 'text' });

module.exports = mongoose.model('Post', PostSchema);
