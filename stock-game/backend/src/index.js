const express=require('express'),http=require('http'),{WebSocketServer}=require('ws'),{Pool}=require('pg'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),cors=require('cors'),helmet=require('helmet'),rate=require('express-rate-limit');
const SECRET=process.env.JWT_SECRET;if(!SECRET||SECRET.length<16){console.error('Set JWT_SECRET (16+ chars)');process.exit(1)}
const DB=process.env.DATABASE_URL;
const pool=new Pool({connectionString:DB,ssl:DB&&!/localhost|127\.0\.0\.1|railway\.internal/.test(DB)?{rejectUnauthorized:false}:false});
const ADMIN=(process.env.ADMIN_USERNAME||'Akei').toLowerCase(),anch=[],START=20000,DAY=86400,today=()=>Math.floor(Date.now()/1000/DAY)*DAY;
// name, base price, daily volatility
const CO=[['The Hammer Store',42,.010],['1ik1ok',118,.022],['Utube',205,.016],['The Car Company',88,.013],['Fast Tech',156,.020],['Bananas',310,.014],['Football Store',27,.018],['Smelly Phones',64,.025],['Blacksmith Inc.',95,.011],['Trust God',12,.028]];
const px=[],tr=[],prev=[];let curDay=today();
const num=x=>parseFloat(x),r4=x=>Math.round(x*1e4)/1e4,bad=m=>Object.assign(new Error(m),{user:1});
const gauss=()=>{let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
async function init(){
 await pool.query(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,username TEXT NOT NULL,pass TEXT NOT NULL,cash NUMERIC NOT NULL DEFAULT 20000 CHECK(cash>=0),realized NUMERIC NOT NULL DEFAULT 0,created TIMESTAMPTZ DEFAULT now());
 ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT false;
 CREATE UNIQUE INDEX IF NOT EXISTS ux_user ON users(lower(username));
 CREATE TABLE IF NOT EXISTS holdings(user_id INT REFERENCES users(id),sym INT,shares NUMERIC NOT NULL CHECK(shares>=0),cost NUMERIC NOT NULL,PRIMARY KEY(user_id,sym));
 CREATE TABLE IF NOT EXISTS tx(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id),sym INT,side TEXT,shares NUMERIC,price NUMERIC,total NUMERIC,ts TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS stocks(sym INT PRIMARY KEY,price NUMERIC,trend NUMERIC);ALTER TABLE stocks ADD COLUMN IF NOT EXISTS anchor NUMERIC;
 CREATE TABLE IF NOT EXISTS candles(sym INT,t BIGINT,o NUMERIC,h NUMERIC,l NUMERIC,c NUMERIC,PRIMARY KEY(sym,t));
 ALTER TABLE users ENABLE ROW LEVEL SECURITY;ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;ALTER TABLE tx ENABLE ROW LEVEL SECURITY;ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;ALTER TABLE candles ENABLE ROW LEVEL SECURITY`);
 if(+(await pool.query('SELECT count(*) n FROM candles')).rows[0].n===0){
  for(let i=0;i<10;i++){const [,base,vol]=CO[i];let p=base*.55,t=0;const T=[],O=[],H=[],L=[],C=[];
   for(let d=1825;d>=1;d--){const o=p;t=t*.97+gauss()*vol*.15;let r=t+vol*.8*gauss()-.004*Math.log(p/base);if(Math.random()<.02)r+=(Math.random()<.5?-1:1)*(.03+Math.random()*.05);p=o*Math.exp(r);
    T.push(today()-d*DAY);O.push(o);C.push(p);H.push(Math.max(o,p)*(1+Math.abs(gauss())*vol*.4));L.push(Math.min(o,p)*(1-Math.abs(gauss())*vol*.4))}
   const k=base/C[C.length-1],S=a=>a.map(x=>r4(x*k));
   await pool.query('INSERT INTO candles SELECT $1,unnest($2::bigint[]),unnest($3::numeric[]),unnest($4::numeric[]),unnest($5::numeric[]),unnest($6::numeric[])',[i,T,S(O),S(H),S(L),S(C)]);
   await pool.query('INSERT INTO stocks VALUES($1,$2,0) ON CONFLICT DO NOTHING',[i,base])}}
 for(const r of (await pool.query('SELECT * FROM stocks')).rows){px[r.sym]=num(r.price);tr[r.sym]=num(r.trend);anch[r.sym]=r.anchor?num(r.anchor):CO[r.sym][1]}
 for(let i=0;i<10;i++){const r=await pool.query('SELECT c FROM candles WHERE sym=$1 AND t<$2 ORDER BY t DESC LIMIT 1',[i,today()]);prev[i]=r.rows[0]?num(r.rows[0].c):px[i]}}
async function tick(){try{const d=today(),roll=d!==curDay;curDay=d;
 for(let i=0;i<10;i++){const [,base,vol]=CO[i];if(roll)prev[i]=px[i];
  tr[i]=tr[i]*.995+gauss()*vol*.01;let r=tr[i]+vol*.05*gauss()-.0002*Math.log(px[i]/anch[i]);
  if(Math.random()<.0015)r+=(Math.random()<.5?-1:1)*(.03+Math.random()*.04);
  r=Math.max(-.08,Math.min(.08,r));px[i]=Math.max(.5,r4(px[i]*(1+r)));
  await pool.query('UPDATE stocks SET price=$2,trend=$3 WHERE sym=$1',[i,px[i],tr[i]]);
  await pool.query('INSERT INTO candles VALUES($1,$2,$3,$3,$3,$3) ON CONFLICT(sym,t) DO UPDATE SET h=GREATEST(candles.h,EXCLUDED.h),l=LEAST(candles.l,EXCLUDED.l),c=EXCLUDED.c',[i,d,px[i]])}
 const m=JSON.stringify({type:'prices',p:px,prev});wss.clients.forEach(c=>c.readyState===1&&c.send(m))}catch(e){console.error('tick',e.message)}}
const app=express(),server=http.createServer(app),wss=new WebSocketServer({server,path:'/ws'});
const origins=(process.env.CORS_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
app.set('trust proxy',1);app.use(helmet(),cors({origin:origins.length?origins:true}),express.json({limit:'10kb'}),rate({windowMs:6e4,limit:300}));
const authLimit=rate({windowMs:9e5,limit:30,message:{error:'Too many attempts, try later'}});
const tokenFor=u=>({token:jwt.sign({id:u.id},SECRET,{expiresIn:'30d'}),username:u.username});
const auth=async(q,s,n)=>{try{q.uid=jwt.verify((q.headers.authorization||'').slice(7),SECRET).id}catch{return s.status(401).json({error:'Not logged in'})}
 try{const r=(await pool.query('SELECT username,banned FROM users WHERE id=$1',[q.uid])).rows[0];if(!r)return s.status(401).json({error:'Not logged in'});if(r.banned)return s.status(403).json({error:'This account is banned'});q.admin=r.username.toLowerCase()===ADMIN;n()}catch{s.status(500).json({error:'Server error'})}};
const adm=(q,s,n)=>q.admin?n():s.status(403).json({error:'Admins only'}),A=fn=>(q,s,n)=>Promise.resolve(fn(q,s,n)).catch(()=>s.status(500).json({error:'Server error'}));
app.get('/health',(q,s)=>s.json({ok:1}));
app.post('/api/register',authLimit,async(q,s)=>{const {username:u,password:p}=q.body||{};
 if(!/^[A-Za-z0-9_]{3,20}$/.test(u||'')||typeof p!=='string'||p.length<6||p.length>72)return s.status(400).json({error:'Username: 3-20 letters/numbers/_. Password: 6-72 characters.'});
 try{const r=await pool.query('INSERT INTO users(username,pass) VALUES($1,$2) RETURNING id,username',[u,await bcrypt.hash(p,11)]);s.json(tokenFor(r.rows[0]))}
 catch(e){s.status(e.code==='23505'?409:500).json({error:e.code==='23505'?'Username already taken':'Server error'})}});
app.post('/api/login',authLimit,async(q,s)=>{const {username:u,password:p}=q.body||{};if(typeof u!=='string'||typeof p!=='string')return s.status(400).json({error:'Missing details'});
 const r=(await pool.query('SELECT id,username,pass,banned FROM users WHERE lower(username)=lower($1)',[u])).rows[0];
 if(!r||!(await bcrypt.compare(p,r.pass)))return s.status(401).json({error:'Wrong username or password'});if(r.banned)return s.status(403).json({error:'This account is banned'});s.json(tokenFor(r))});
async function state(uid,c=pool){const u=(await c.query('SELECT username,cash,realized FROM users WHERE id=$1',[uid])).rows[0],hold={};
 (await c.query('SELECT sym,shares,cost FROM holdings WHERE user_id=$1',[uid])).rows.forEach(x=>hold[x.sym]={shares:num(x.shares),cost:num(x.cost)});
 return{user:{username:u.username,cash:num(u.cash),realized:num(u.realized),admin:u.username.toLowerCase()===ADMIN},stocks:CO.map((c,i)=>({id:i,name:c[0],price:px[i],prev:prev[i]})),holdings:hold}}
app.get('/api/state',auth,async(q,s)=>{try{s.json(await state(q.uid))}catch{s.status(401).json({error:'Not logged in'})}});
app.get('/api/spark',auth,async(q,s)=>{const o={};(await pool.query('SELECT sym,array_agg(c ORDER BY t) a FROM(SELECT sym,t,c,row_number() OVER(PARTITION BY sym ORDER BY t DESC) rn FROM candles)x WHERE rn<=30 GROUP BY sym')).rows.forEach(r=>o[r.sym]=r.a.map(num));s.json(o)});
app.get('/api/candles/:id',auth,async(q,s)=>{const i=+q.params.id,days={'5y':1825,'1y':365,'6m':183,'3m':92,'1m':31}[q.query.range];if(!(i>=0&&i<10)||!days)return s.status(400).json({error:'Bad request'});
 s.json((await pool.query('SELECT t,o,h,l,c FROM candles WHERE sym=$1 AND t>=$2 ORDER BY t',[i,today()-days*DAY])).rows.map(r=>({t:num(r.t),o:num(r.o),h:num(r.h),l:num(r.l),c:num(r.c)})))});
app.post('/api/trade/:side',auth,async(q,s)=>{const side=q.params.side,{id,value,max}=q.body||{},v=num(value);
 if(!['buy','sell'].includes(side)||!Number.isInteger(id)||id<0||id>9||(!max&&!(v>0&&isFinite(v))))return s.status(400).json({error:'Enter a positive amount'});
 const c=await pool.connect();
 try{await c.query('BEGIN');const u=(await c.query('SELECT cash FROM users WHERE id=$1 FOR UPDATE',[q.uid])).rows[0],p=px[id],cash=num(u.cash);
  const h=(await c.query('SELECT shares,cost FROM holdings WHERE user_id=$1 AND sym=$2 FOR UPDATE',[q.uid,id])).rows[0];let sh,tot;
  if(side==='buy'){const T=max?u.cash:v.toFixed(2);tot=num(T);if(tot<.01)throw bad('Minimum purchase is 0.01');if(tot>cash)throw bad('Not enough cash');sh=tot/p;
   await c.query('INSERT INTO holdings VALUES($1,$2,$3,$4) ON CONFLICT(user_id,sym) DO UPDATE SET shares=holdings.shares+EXCLUDED.shares,cost=holdings.cost+EXCLUDED.cost',[q.uid,id,sh,tot]);
   await c.query('UPDATE users SET cash=cash-$2 WHERE id=$1',[q.uid,T])}
  else{const own=h?num(h.shares):0;sh=max?own:v;if(sh<=0||sh>own+1e-9)throw bad('You do not own that many shares');sh=Math.min(sh,own);tot=sh*p;const basis=num(h.cost)/own*sh;
   if(own-sh<1e-9)await c.query('DELETE FROM holdings WHERE user_id=$1 AND sym=$2',[q.uid,id]);else await c.query('UPDATE holdings SET shares=shares-$3,cost=cost-$4 WHERE user_id=$1 AND sym=$2',[q.uid,id,sh,basis]);
   await c.query('UPDATE users SET cash=cash+$2,realized=realized+$3 WHERE id=$1',[q.uid,tot,tot-basis])}
  await c.query('INSERT INTO tx(user_id,sym,side,shares,price,total) VALUES($1,$2,$3,$4,$5,$6)',[q.uid,id,side,sh,p,tot]);
  const st=await state(q.uid,c);await c.query('COMMIT');s.json(st)}
 catch(e){await c.query('ROLLBACK').catch(()=>{});s.status(e.user?400:500).json({error:e.user?e.message:'Server error'})}finally{c.release()}});
app.get('/api/history',auth,async(q,s)=>s.json((await pool.query('SELECT sym,side,shares,price,total,ts FROM tx WHERE user_id=$1 ORDER BY id DESC LIMIT 300',[q.uid])).rows.map(r=>({sym:r.sym,side:r.side,shares:num(r.shares),price:num(r.price),total:num(r.total),ts:r.ts}))));
app.get('/api/leaderboard',auth,async(q,s)=>{const hv={};(await pool.query('SELECT user_id,sym,shares FROM holdings')).rows.forEach(h=>hv[h.user_id]=(hv[h.user_id]||0)+num(h.shares)*px[h.sym]);
 s.json((await pool.query('SELECT id,username,cash,banned FROM users')).rows.filter(u=>q.admin||!u.banned).map(u=>{const n=num(u.cash)+(hv[u.id]||0);return{username:u.username,net:n,profit:n-START,ret:(n/START-1)*100,crown:u.username.toLowerCase()===ADMIN,...(q.admin?{cash:num(u.cash),banned:u.banned}:{})}}).sort((a,b)=>b.net-a.net).slice(0,100))});
async function setPrice(i,p){px[i]=Math.max(.5,r4(p));tr[i]=0;anch[i]=px[i];await pool.query('UPDATE stocks SET price=$2,anchor=$2,trend=0 WHERE sym=$1',[i,px[i]]);
 await pool.query('INSERT INTO candles VALUES($1,$2,$3,$3,$3,$3) ON CONFLICT(sym,t) DO UPDATE SET h=GREATEST(candles.h,EXCLUDED.h),l=LEAST(candles.l,EXCLUDED.l),c=EXCLUDED.c',[i,today(),px[i]]);
 const m=JSON.stringify({type:'prices',p:px,prev});wss.clients.forEach(c=>c.readyState===1&&c.send(m))}
app.post('/api/admin/stock',auth,adm,A(async(q,s)=>{const {id,op,value}=q.body||{},v=num(value);if(!Number.isInteger(id)||id<0||id>9||!['mul','div','add','sub','set'].includes(op)||!(v>0&&v<1e9))return s.status(400).json({error:'Enter a valid number'});
 const p=px[id];await setPrice(id,{mul:p*v,div:p/v,add:p+v,sub:p-v,set:v}[op]);s.json({price:px[id]})}));
app.post('/api/admin/money',auth,adm,A(async(q,s)=>{const {username:u,op,amount}=q.body||{},v=num(amount);if(typeof u!=='string'||!['set','add','sub'].includes(op)||!(v>=0&&v<1e12))return s.status(400).json({error:'Enter a valid amount'});
 const e={set:'$2',add:'cash+$2',sub:'GREATEST(cash-$2,0)'}[op],r=await pool.query(`UPDATE users SET cash=${e} WHERE lower(username)=lower($1) RETURNING cash`,[u,v.toFixed(2)]);if(!r.rows[0])return s.status(404).json({error:'No such user'});s.json({cash:num(r.rows[0].cash)})}));
app.post('/api/admin/ban',auth,adm,A(async(q,s)=>{const {username:u,banned}=q.body||{};if(typeof u!=='string'||u.toLowerCase()===ADMIN)return s.status(400).json({error:'Cannot ban this user'});
 const r=await pool.query('UPDATE users SET banned=$2 WHERE lower(username)=lower($1) RETURNING id',[u,!!banned]);if(!r.rows[0])return s.status(404).json({error:'No such user'});s.json({ok:1})}));
wss.on('connection',(ws,req)=>{try{jwt.verify(new URL(req.url,'http://x').searchParams.get('token'),SECRET);ws.send(JSON.stringify({type:'prices',p:px,prev}))}catch{ws.close(1008)}});
init().then(()=>{setInterval(tick,5000);server.listen(process.env.PORT||3000,()=>console.log('Server up'))}).catch(e=>{console.error(e);process.exit(1)});
