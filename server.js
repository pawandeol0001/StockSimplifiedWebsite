const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'stock-simplified.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS episodes(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,duration TEXT NOT NULL,level TEXT NOT NULL,accent TEXT NOT NULL,episode_no INTEGER UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS bookmarks(user_id INTEGER,episode_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,episode_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(episode_id) REFERENCES episodes(id));
CREATE TABLE IF NOT EXISTS progress(user_id INTEGER,episode_id INTEGER,completed INTEGER DEFAULT 0,position INTEGER DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,episode_id));
CREATE TABLE IF NOT EXISTS quiz_results(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,episode_id INTEGER,score INTEGER,total INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,plan TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL,reference TEXT UNIQUE NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS user_roles(user_id INTEGER PRIMARY KEY,role TEXT NOT NULL DEFAULT 'user',FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS site_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

const defaultSettings = { site_name: 'Stock Simplified', hero_title: 'Finance, without the finance-speak.', hero_description: 'Stock Simplified turns intimidating stock-market ideas into short, story-based episodes you can understand on your commute, between classes, or whenever you have a few minutes.', about_text: 'A student project that turns beginner stock-market concepts into short, story-based audio lessons with quizzes and progress tracking.' };
const saveSetting = db.prepare('INSERT INTO site_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING');
for (const [key, value] of Object.entries(defaultSettings)) saveSetting.run(key, value);

// Demo administrator for classroom demonstration. Change this password before any real deployment.
const adminEmail = 'admin@stocksimplified.local';
let admin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!admin) {
  const adminId = db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)')
    .run('Stock Simplified Admin', adminEmail, bcrypt.hashSync('Admin@123', 10)).lastInsertRowid;
  db.prepare('INSERT OR REPLACE INTO user_roles(user_id, role) VALUES(?, ?)').run(adminId, 'admin');
} else {
  db.prepare('INSERT OR IGNORE INTO user_roles(user_id, role) VALUES(?, ?)').run(admin.id, 'admin');
}

const count=db.prepare('SELECT COUNT(*) c FROM episodes').get().c;
if(!count){
 const ins=db.prepare('INSERT INTO episodes(title,category,description,duration,level,accent,episode_no) VALUES(?,?,?,?,?,?,?)');
 const eps=[
 ['Stock Market 101','Basics','Start here: understand what the stock market is, why companies issue shares, and how investors participate.','06:20','Beginner','SM','01'],
 ['Shares: Owning a Tiny Piece','Basics','A story-based explanation of shares, ownership, price movement and dividends.','07:10','Beginner','SH','02'],
 ['IPO: Before the First Trade','IPO','Follow a fictional company as it goes public and learn what an IPO means.','08:05','Beginner','IP','03'],
 ['NSE vs BSE','Market','Learn what the two major Indian stock exchanges do and how they differ.','06:45','Beginner','EX','04'],
 ['Mutual Funds Without the Jargon','Funds','Understand pooling money, fund managers, NAV and basic fund types.','08:30','Beginner','MF','05'],
 ['SIP: Small Steps, Long Horizon','Investing','See how a recurring investment approach works through a simple monthly example.','07:25','Beginner','SI','06'],
 ['Trading vs Investing','Strategy','A practical comparison of short-term trading and long-term investing.','09:00','Intermediate','TI','07'],
 ['Bull, Bear & Market Mood','Market','Decode common market language without getting lost in jargon.','06:55','Beginner','BM','08']
 ]; eps.forEach(e=>ins.run(e));
}

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({secret:'stock-simplified-demo-secret',resave:false,saveUninitialized:false,cookie:{maxAge:1000*60*60*8}}));
app.use(express.static(path.join(__dirname,'public')));

function user(req) {
  if (!req.session.userId) return null;
  return db.prepare(`SELECT users.id, users.name, users.email, COALESCE(user_roles.role, 'user') AS role
    FROM users LEFT JOIN user_roles ON users.id = user_roles.user_id WHERE users.id = ?`).get(req.session.userId) || null;
}
function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in first.' });
  next();
}
function adminOnly(req, res, next) {
  if (!user(req) || user(req).role !== 'admin') return res.status(403).json({ error: 'Admin access only.' });
  next();
}

app.get('/api/me',(req,res)=>res.json({user:user(req)}));
app.post('/api/register',(req,res)=>{const {name,email,password}=req.body;if(!name||!email||!password||password.length<6)return res.status(400).json({error:'Enter a name, valid email and password of at least 6 characters.'});try{const hash=bcrypt.hashSync(password,10);const r=db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name,email.toLowerCase(),hash);req.session.userId=r.lastInsertRowid;db.prepare('INSERT OR IGNORE INTO user_roles(user_id, role) VALUES(?, ?)').run(r.lastInsertRowid, 'user');res.json({user:user(req)});}catch(e){res.status(400).json({error:'An account with this email already exists.'});}});
app.post('/api/login',(req,res)=>{const {email,password}=req.body;const u=db.prepare('SELECT * FROM users WHERE email=?').get((email||'').toLowerCase());if(!u||!bcrypt.compareSync(password||'',u.password))return res.status(401).json({error:'Incorrect email or password.'});req.session.userId=u.id;res.json({user:user(req)});});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/episodes',(req,res)=>{const u=user(req);const eps=db.prepare('SELECT * FROM episodes ORDER BY episode_no').all();if(u){const bm=new Set(db.prepare('SELECT episode_id FROM bookmarks WHERE user_id=?').all(u.id).map(x=>x.episode_id));const pr=new Map(db.prepare('SELECT episode_id,completed,position FROM progress WHERE user_id=?').all(u.id).map(x=>[x.episode_id,x]));eps.forEach(e=>{e.bookmarked=bm.has(e.id);e.completed=!!pr.get(e.id)?.completed;e.position=pr.get(e.id)?.position||0;});}res.json(eps);});
app.get('/api/episodes/:id',(req,res)=>{const e=db.prepare('SELECT * FROM episodes WHERE id=?').get(req.params.id);if(!e)return res.status(404).json({error:'Episode not found'});const u=user(req);if(u){e.bookmarked=!!db.prepare('SELECT 1 FROM bookmarks WHERE user_id=? AND episode_id=?').get(u.id,e.id);e.completed=!!db.prepare('SELECT completed FROM progress WHERE user_id=? AND episode_id=?').get(u.id,e.id)?.completed;}res.json(e);});
app.post('/api/bookmarks/:id',auth,(req,res)=>{const exists=db.prepare('SELECT 1 FROM bookmarks WHERE user_id=? AND episode_id=?').get(req.session.userId,req.params.id);if(exists)db.prepare('DELETE FROM bookmarks WHERE user_id=? AND episode_id=?').run(req.session.userId,req.params.id);else db.prepare('INSERT INTO bookmarks(user_id,episode_id) VALUES(?,?)').run(req.session.userId,req.params.id);res.json({bookmarked:!exists});});
app.get('/api/bookmarks',auth,(req,res)=>res.json(db.prepare('SELECT e.* FROM episodes e JOIN bookmarks b ON e.id=b.episode_id WHERE b.user_id=? ORDER BY b.created_at DESC').all(req.session.userId)));
app.post('/api/progress/:id',auth,(req,res)=>{const completed=req.body.completed?1:0;const position=Number(req.body.position||0);db.prepare(`INSERT INTO progress(user_id,episode_id,completed,position) VALUES(?,?,?,?) ON CONFLICT(user_id,episode_id) DO UPDATE SET completed=excluded.completed,position=excluded.position,updated_at=CURRENT_TIMESTAMP`).run(req.session.userId,req.params.id,completed,position);res.json({ok:true});});
app.post('/api/quiz/:id',auth,(req,res)=>{const answers=Array.isArray(req.body.answers)?req.body.answers:[];const key=['b','a','c','b','a'];let score=0;answers.forEach((a,i)=>{if(a===key[i])score++});db.prepare('INSERT INTO quiz_results(user_id,episode_id,score,total) VALUES(?,?,?,?)').run(req.session.userId,req.params.id,score,key.length);db.prepare(`INSERT INTO progress(user_id,episode_id,completed) VALUES(?,?,1) ON CONFLICT(user_id,episode_id) DO UPDATE SET completed=1,updated_at=CURRENT_TIMESTAMP`).run(req.session.userId,req.params.id);res.json({score,total:key.length,message:score===5?'Perfect! You nailed it.':score>=3?'Nice work! Review the episode once more for the missed ideas.':'Good attempt. Revisit the episode and try again.'});});
app.get('/api/dashboard',auth,(req,res)=>{const id=req.session.userId;const total=db.prepare('SELECT COUNT(*) c FROM episodes').get().c;const completed=db.prepare('SELECT COUNT(*) c FROM progress WHERE user_id=? AND completed=1').get(id).c;const bookmarks=db.prepare('SELECT COUNT(*) c FROM bookmarks WHERE user_id=?').get(id).c;const avg=db.prepare('SELECT ROUND(AVG(score*100.0/total),0) v FROM quiz_results WHERE user_id=?').get(id).v||0;const currentPlan=db.prepare('SELECT plan,status,amount,created_at FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 1').get(id)||{plan:'Free',status:'FREE',amount:0,created_at:null};res.json({total,completed,bookmarks,avg,currentPlan});});
app.get('/api/quiz/:id',(req,res)=>res.json({questions:[
 {q:'What does owning a share generally represent?',o:{a:'A bank loan',b:'A small ownership interest in a company',c:'A tax receipt',d:'A fixed deposit'},a:'b'},
 {q:'What is an IPO?',o:{a:'A company offering shares to the public for the first time',b:'A daily market report',c:'A mutual fund fee',d:'A bank account'},a:'a'},
 {q:'What does SIP commonly describe?',o:{a:'A stock exchange',b:'A trading tax',c:'A regular investment approach',d:'A company share class'},a:'c'},
 {q:'Which pair represents major Indian stock exchanges?',o:{a:'RBI and SEBI',b:'NSE and BSE',c:'UPI and NPCI',d:'SIP and NAV'},a:'b'},
 {q:'What is the main learning purpose of Stock Simplified?',o:{a:'Guarantee profits',b:'Provide trading signals',c:'Make beginner stock-market concepts easier to understand',d:'Execute trades automatically'},a:'c'}
]}));


// Classroom checkout: free trial is recorded as a trial; paid packages are simulated.
// No real money is collected. Connect a provider such as Razorpay only for production use.
app.post('/api/payments/checkout', auth, (req, res) => {
  const plans = { Starter: 199, Plus: 399, Pro: 699 };
  const plan = String(req.body.plan || '');
  const userId = req.session.userId;
  if (plan === 'Free Trial') {
    const alreadyUsed = db.prepare("SELECT 1 FROM payments WHERE user_id=? AND plan='Free Trial' LIMIT 1").get(userId);
    if (alreadyUsed) return res.status(400).json({ error: 'Your 7-day free trial has already been used. Choose a paid package to continue.' });
    const reference = `TRIAL-${Date.now()}-${userId}`;
    db.prepare('INSERT INTO payments(user_id, plan, amount, status, reference) VALUES(?,?,?,?,?)')
      .run(userId, 'Free Trial', 0, 'TRIAL_STARTED_7_DAYS', reference);
    return res.json({ ok: true, plan: 'Free Trial', amount: 0, reference, status: 'TRIAL_STARTED_7_DAYS', message: 'Your 7-day free trial is activated. No payment required.' });
  }
  if (!plans[plan]) return res.status(400).json({ error: 'Choose a valid learning plan.' });
  const reference = `DEMO-${Date.now()}-${userId}`;
  db.prepare('INSERT INTO payments(user_id, plan, amount, status, reference) VALUES(?,?,?,?,?)')
    .run(userId, plan, plans[plan], 'SIMULATED_SUCCESS', reference);
  res.json({ ok: true, plan, amount: plans[plan], reference, status: 'SIMULATED_SUCCESS', message: `Demo checkout recorded for ${plan}. No real money was charged.` });
});
app.get('/api/payments/mine', auth, (req, res) => {
  res.json(db.prepare('SELECT id, plan, amount, status, reference, created_at FROM payments WHERE user_id = ? ORDER BY id DESC').all(req.session.userId));
});

app.get('/api/site-settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM site_settings').all();
  res.json(Object.fromEntries(rows.map(row => [row.key, row.value])));
});
app.put('/api/admin/site-settings', auth, adminOnly, (req, res) => {
  const allowed = ['site_name', 'hero_title', 'hero_description', 'about_text'];
  const update = db.prepare('INSERT INTO site_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const transaction = db.transaction(() => {
    for (const key of allowed) {
      if (typeof req.body[key] === 'string') update.run(key, req.body[key].trim().slice(0, 1200));
    }
  });
  transaction();
  res.json({ ok: true, message: 'Website content updated.' });
});
app.post('/api/admin/episodes', auth, adminOnly, (req, res) => {
  const { title, category, description, duration, level, accent, episode_no } = req.body;
  if (![title, category, description, duration, level, episode_no].every(v => String(v || '').trim())) return res.status(400).json({ error: 'Fill in all required episode fields.' });
  try {
    const result = db.prepare('INSERT INTO episodes(title,category,description,duration,level,accent,episode_no) VALUES(?,?,?,?,?,?,?)')
      .run(title.trim(), category.trim(), description.trim(), duration.trim(), level.trim(), String(accent || 'SS').trim().slice(0,8), Number(episode_no));
    res.json({ ok: true, id: result.lastInsertRowid, message: 'Episode added.' });
  } catch (e) { res.status(400).json({ error: 'Could not add episode. Check that the episode number is unique.' }); }
});
app.put('/api/admin/episodes/:id', auth, adminOnly, (req, res) => {
  const { title, category, description, duration, level, accent, episode_no } = req.body;
  if (![title, category, description, duration, level, episode_no].every(v => String(v || '').trim())) return res.status(400).json({ error: 'Fill in all required episode fields.' });
  try {
    const result = db.prepare('UPDATE episodes SET title=?,category=?,description=?,duration=?,level=?,accent=?,episode_no=? WHERE id=?')
      .run(title.trim(), category.trim(), description.trim(), duration.trim(), level.trim(), String(accent || 'SS').trim().slice(0,8), Number(episode_no), req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'Episode not found.' });
    res.json({ ok: true, message: 'Episode updated.' });
  } catch (e) { res.status(400).json({ error: 'Could not update episode. Check that the episode number is unique.' }); }
});
app.delete('/api/admin/episodes/:id', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT id FROM episodes WHERE id=?').get(id);
  if (!exists) return res.status(404).json({ error: 'Episode not found.' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM bookmarks WHERE episode_id=?').run(id);
    db.prepare('DELETE FROM progress WHERE episode_id=?').run(id);
    db.prepare('DELETE FROM quiz_results WHERE episode_id=?').run(id);
    db.prepare('DELETE FROM episodes WHERE id=?').run(id);
  });
  tx(); res.json({ ok: true, message: 'Episode deleted.' });
});

app.get('/api/admin/summary', auth, adminOnly, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const episodes = db.prepare('SELECT COUNT(*) c FROM episodes').get().c;
  const quizzes = db.prepare('SELECT COUNT(*) c FROM quiz_results').get().c;
  const payments = db.prepare('SELECT COUNT(*) c FROM payments').get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE status = 'SIMULATED_SUCCESS'").get().n;
  res.json({ users, episodes, quizzes, payments, revenue });
});
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  res.json(db.prepare(`SELECT u.id, u.name, u.email, u.created_at, COALESCE(r.role, 'user') role,
    (SELECT COUNT(*) FROM bookmarks b WHERE b.user_id=u.id) bookmarks,
    (SELECT COUNT(*) FROM quiz_results q WHERE q.user_id=u.id) quizzes
    FROM users u LEFT JOIN user_roles r ON u.id=r.user_id ORDER BY u.id DESC`).all());
});
app.get('/api/admin/payments', auth, adminOnly, (req, res) => {
  res.json(db.prepare(`SELECT p.id, u.name, u.email, p.plan, p.amount, p.status, p.reference, p.created_at
    FROM payments p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC`).all());
});
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT,()=>console.log(`Stock Simplified running at http://localhost:${PORT}`));
