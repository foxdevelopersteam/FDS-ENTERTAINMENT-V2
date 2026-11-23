import{getStore}from"@netlify/blobs";
import{randomBytes,scryptSync,timingSafeEqual}from"node:crypto";
const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json"}});
const bad=(m,s=400)=>J({error:m},s);
const TY=["video","short","music","podcast","photo","text"],NAME=/^[a-z0-9.]{3,20}$/,ID=/^[a-f0-9]{16}$/;
export const config={path:"/api/*"};
export default async(req)=>{
const st=getStore({name:"fds",consistency:"strong"}),url=new URL(req.url),[a,b,c]=url.pathname.replace(/^\/api\/?/,"").split("/"),m=req.method,sp=url.searchParams;
const body=()=>req.json().catch(()=>({})),gj=k=>st.get(k,{type:"json"}),sj=(k,v)=>st.setJSON(k,v);
const tk=(req.headers.get("authorization")||"").slice(7);
const me=/^[a-f0-9]{48}$/.test(tk)?await st.get("s/"+tk):null;
const hp=(pw,s)=>scryptSync(pw,s,32).toString("hex");
const sess=async n=>{const t=randomBytes(24).toString("hex");await st.set("s/"+t,n);return J({token:t,name:n})};
const strip=i=>({...i,likes:i.likes.length});
const allItems=async()=>{const{blobs}=await st.list({prefix:"i/"});return(await Promise.all(blobs.slice(0,300).map(x=>gj(x.key)))).filter(Boolean)};
if(a==="signup"&&m==="POST"){const d=await body(),n=String(d.name||"").toLowerCase().replace(/@fds\.com$/,""),pw=d.password;
 if(!NAME.test(n))return bad('Username: 3-20 letters, numbers or dots. No "_" allowed.');
 if(typeof pw!=="string"||pw.length<6||pw.includes("_"))return bad('Password: at least 6 characters, no "_".');
 if(await gj("u/"+n))return bad("That FDS account already exists.");
 const salt=randomBytes(16).toString("hex");await sj("u/"+n,{salt,h:hp(pw,salt),ch:null});return sess(n)}
if(a==="login"&&m==="POST"){const d=await body(),n=String(d.name||"").toLowerCase().replace(/@fds\.com$/,""),u=NAME.test(n)&&await gj("u/"+n);
 if(!u||typeof d.password!=="string"||!timingSafeEqual(Buffer.from(hp(d.password,u.salt)),Buffer.from(u.h)))return bad("Wrong username or password.",401);return sess(n)}
if(a==="feed"&&m==="GET"){let r=await allItems();const ty=sp.get("type"),ch=sp.get("ch"),q=(sp.get("q")||"").toLowerCase();
 if(ty)r=r.filter(i=>i.type===ty);if(ch)r=r.filter(i=>i.ch===ch);if(sp.get("mine"))r=r.filter(i=>i.owner===me);
 if(q)r=r.filter(i=>(i.title+i.desc+i.ch).toLowerCase().includes(q));
 if(sp.get("subs")){const s=me?(await gj("subs/"+me))||[]:[];r=r.filter(i=>s.includes(i.ch))}
 return J(r.sort((x,y)=>y.created-x.created).slice(0,60).map(strip))}
if(a==="item"&&b&&m==="GET"){const i=ID.test(b)&&await gj("i/"+b);if(!i)return bad("Not found",404);const s=me?(await gj("subs/"+me))||[]:[];return J({item:strip(i),liked:!!me&&i.likes.includes(me),subbed:s.includes(i.ch)})}
if(a==="chunk"&&m==="GET"){const buf=ID.test(b)&&await st.get(`m/${b}/${+c}`,{type:"arrayBuffer"});if(!buf)return bad("Not found",404);return new Response(buf,{headers:{"content-type":"application/octet-stream","cache-control":"private, max-age=3600"}})}
if(a==="channel"&&b&&m==="GET"){const ch=NAME.test(b)&&await gj("c/"+b);if(!ch)return bad("Not found",404);const s=me?(await gj("subs/"+me))||[]:[];return J({ch,subbed:s.includes(b),items:(await allItems()).filter(i=>i.ch===b).sort((x,y)=>y.created-x.created).map(strip)})}
if(!me)return bad("Sign in first",401);
const u=await gj("u/"+me);
if(a==="me"&&m==="GET")return J({name:me,channel:u.ch?await gj("c/"+u.ch):null,subs:(await gj("subs/"+me))||[]});
if(a==="logout"&&m==="POST"){await st.delete("s/"+tk);return J({ok:1})}
if(a==="channel"&&m==="POST"){const d=await body(),h=String(d.handle||"").toLowerCase();
 if(u.ch)return bad("One account can only have one channel.");if(!NAME.test(h))return bad("Handle: 3-20 letters, numbers or dots.");
 if(await gj("c/"+h))return bad("That channel handle is taken.");
 const ch={handle:h,title:String(d.title||h).slice(0,40),about:String(d.about||"").slice(0,300),owner:me,subs:0,created:Date.now()};
 await sj("c/"+h,ch);u.ch=h;await sj("u/"+me,u);return J(ch)}
if(!u.ch&&["chunk","item"].includes(a)&&m!=="DELETE")return bad("Create your channel first (Account page).");
if(a==="chunk"&&m==="PUT"){const n=+c;if(!ID.test(b)||!(n>=0&&n<25))return bad("Bad chunk");
 const o=await st.get("o/"+b);if(o&&o!==me)return bad("Forbidden",403);if(!o)await st.set("o/"+b,me);
 const buf=await req.arrayBuffer();if(buf.byteLength>4.5*1048576)return bad("Chunk too big");await st.set(`m/${b}/${n}`,buf);return J({ok:1})}
if(a==="item"&&m==="POST"){const d=await body(),t=String(d.title||"").trim().slice(0,100);if(!TY.includes(d.type)||!t)return bad("Bad post");
 let id=d.id,ck=0;if(d.type==="text"){id=randomBytes(8).toString("hex")}else{ck=+d.chunks;if(!ID.test(id)||!(ck>=1&&ck<=25)||await st.get("o/"+id)!==me)return bad("Upload incomplete");if(await gj("i/"+id))return bad("Exists")}
 const i={id,type:d.type,title:t,desc:String(d.desc||"").slice(0,2000),owner:me,ch:u.ch,mime:String(d.mime||"").slice(0,60),chunks:ck,size:+d.size||0,likes:[],created:Date.now()};await sj("i/"+id,i);return J(strip(i))}
if(a==="like"&&m==="POST"){const i=ID.test(b)&&await gj("i/"+b);if(!i)return bad("Not found",404);const k=i.likes.indexOf(me);k<0?i.likes.push(me):i.likes.splice(k,1);await sj("i/"+b,i);return J({liked:k<0,likes:i.likes.length})}
if(a==="sub"&&m==="POST"){const ch=NAME.test(b)&&await gj("c/"+b);if(!ch)return bad("Not found",404);if(ch.owner===me)return bad("You can't subscribe to your own channel.");
 const s=(await gj("subs/"+me))||[],k=s.indexOf(b);k<0?s.push(b):s.splice(k,1);ch.subs=Math.max(0,ch.subs+(k<0?1:-1));await sj("subs/"+me,s);await sj("c/"+b,ch);return J({subbed:k<0,subs:ch.subs})}
if(a==="item"&&m==="DELETE"){const i=ID.test(b)&&await gj("i/"+b);if(!i||i.owner!==me)return bad("Forbidden",403);for(let n=0;n<i.chunks;n++)await st.delete(`m/${b}/${n}`);await st.delete("o/"+b);await st.delete("i/"+b);return J({ok:1})}
return bad("Not found",404)};
