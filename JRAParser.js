/* JRA iPhone copy parser - parser only, no prediction logic. */
(function(global){
  'use strict';
  const SPECIAL = ['取消','中止','除外','失格'];
  const STATUS_RE = /取消|中止|除外|失格/;
  const DATE_RE = /(20\d{2})[\.\/-](\d{1,2})[\.\/-](\d{1,2})|(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/;
  const NUM = s => s == null ? null : Number(String(s).replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/,/g,''));
  const normNum = s => String(s||'').replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));
  const clean = s => String(s||'').replace(/\u00a0/g,' ').replace(/[\u3000\t]+/g,' ').replace(/[ ]{2,}/g,' ').trim();
  const escName = s => clean(s).replace(/^[0-9０-９]{1,2}[\s.、)）-]*/,'').trim();
  const uniq = a => [...new Set(a)];

  function normalizeText(raw){
    return String(raw||'').replace(/\r\n?/g,'\n').replace(/[\u200b\u200c\u200d\ufeff]/g,'').replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));
  }
  function lines(raw){ return normalizeText(raw).split('\n').map((text,i)=>({i,text:clean(text)})); }
  function parseDate(s){
    const m=String(s||'').match(DATE_RE); if(!m) return null;
    const y=m[1]||m[4], mo=m[2]||m[5], d=m[3]||m[6];
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function dateIn(s){ return DATE_RE.test(s||''); }
  function sexAge(s){ const m=String(s||'').match(/([牡牝騸セ])\s*([2-9])\s*歳?/); return m?{sex:m[1],age:Number(m[2])}:null; }
  function horseWeight(s){ const m=String(s||'').match(/(?:^|\s)(4[0-9]{2}|5[0-9]{2}|6[0-9]{2}|7[0-9]{2})(?:\s*\(([+-]?[0-9]{1,3})\))?(?:kg|キロ)?(?=\s|$)/i); return m?{weight:Number(m[1]),change:m[2]!=null?Number(m[2]):null}:null; }
  function distance(s){ const x=String(s||''); const m=x.match(/(芝|ダート|障害)\s*(\d{3,4})\s*m/i)||x.match(/(\d{3,4})\s*m/i); return m?(m.length===3?{surface:m[1],distance:Number(m[2])}:{surface:null,distance:Number(m[1])}):null; }
  function condition(s){ const m=String(s||'').match(/(良|稍重|重|不良)/); return m?m[1]:null; }
  function timeVal(s){ const m=String(s||'').match(/(?:^|\s)(\d{1,2}):([0-5]\d)(?:\.(\d))?(?=\s|$)/); if(!m)return null; return Number(m[1])*60+Number(m[2])+Number(`0.${m[3]||0}`); }
  function last3f(s){ const m=String(s||'').match(/(?:^|\s)(3[0-9]\.[0-9])(?:\s|$)/); return m?Number(m[1]):null; }
  function finish(s){
    const sp=String(s||'').match(STATUS_RE); if(sp)return {status:sp[0],position:null};
    const m=String(s||'').match(/(?:^|\s)([1-9]|1[0-8])(?:着)?(?=\s|$)/); return m?{status:'FINISH',position:Number(m[1])}:null;
  }
  function fieldInfo(s){ const m=String(s||'').match(/([1-9]|1[0-8])\s*頭\s*([1-9]|1[0-8])\s*番(?:\s*([1-9]|1[0-8])\s*番人気)?/); return m?{fieldSize:Number(m[1]),horseNumber:Number(m[2]),popularity:m[3]?Number(m[3]):null}:null; }
  function jockey(s){
    const labels=['ルメール','川田','横山武','横山和','戸崎','坂井','松山','岩田望','菅原明','丹内','佐々木','武豊','鮫島駿','西村淳','団野','津村','三浦','田辺','菊沢','小林勝','小沢'];
    for(const x of labels) if(String(s).includes(x)) return x;
    const m=String(s||'').match(/([一-龥]{2,5})\s*(?=(?:5[0-9]|6[0-9])(?:\.0)?(?:\s|kg|$))/); return m?m[1]:null;
  }
  function trackName(s){
    const tracks='札幌 函館 福島 新潟 東京 中山 中京 京都 阪神 小倉 門別 盛岡 水沢 浦和 船橋 大井 川崎 金沢 笠松 名古屋 園田 姫路 高知 佐賀';
    const found=tracks.split(' ').find(x=>String(s).includes(x)); return found||null;
  }
  function raceName(s){
    const t=clean(s).replace(/\d{1,2}R.*$/,'').trim();
    if(/(新馬|未勝利|１勝|2勝|3勝|オープン|G[123]|重賞|特別|カップ|ステークス|Ｓ$|記念)/i.test(t)) return t.slice(0,40);
    return null;
  }
  function nameCandidate(s){
    const x=escName(s); if(!x || x.length<2 || x.length>24)return false;
    if(/^(前走|前々走|3走前|4走前|馬名|騎手|斤量|人気|着順|タイム|通過|上り|馬体重|調教師|性齢|枠番|馬番|単勝)/.test(x))return false;
    if(/^[0-9 .:+-]+$/.test(x))return false;
    if(/[R頭番人気着mkg%]/.test(x) && x.length<6)return false;
    return /[一-龥ぁ-んァ-ヶー]/.test(x);
  }
  function horseHeaderScore(a, i, ls){
    const t=a.text; let score=0;
    const m=t.match(/^(?:\s*)?(1[0-8]|[1-9])[\s.、)）:-]+(.{2,24})$/);
    if(m) score+=30;
    if(nameCandidate(t.replace(/^(?:\s*)?(1[0-8]|[1-9])[\s.、)）:-]+/,''))) score+=30;
    const near=ls.slice(i,Math.min(ls.length,i+5)).map(x=>x.text).join(' ');
    if(/([牡牝騸セ])\s*[2-9]\s*歳?/.test(near))score+=15;
    if(/(?:4[0-9]{2}|5[0-9]{2}|6[0-9]{2}|7[0-9]{2})\s*kg?/.test(near)||/(?:4[0-9]{2}|5[0-9]{2}|6[0-9]{2}|7[0-9]{2})\s*\([+-]?\d+\)/.test(near))score+=10;
    if(jockey(near))score+=15;
    return score;
  }
  function detectHorseBlocks(ls){
    const candidates=[];
    for(let i=0;i<ls.length;i++){
      if(!ls[i].text)continue;
      const score=horseHeaderScore(ls[i],i,ls);
      if(score>=60)candidates.push({start:i,score,confidence:score>=80?'HIGH':score>=60?'MEDIUM':'LOW'});
    }
    // suppress nearby duplicates: prefer higher score within 2 lines
    candidates.sort((a,b)=>a.start-b.start);
    const starts=[];
    for(const c of candidates){
      const prev=starts[starts.length-1];
      if(prev && c.start-prev.start<=2){ if(c.score>prev.score)starts[starts.length-1]=c; }
      else starts.push(c);
    }
    return starts.map((x,i)=>({...x,end:i+1<starts.length?starts[i+1].start:ls.length}));
  }
  function parseCurrent(block, meta){
    const text=block.map(x=>x.text).filter(Boolean).join(' ');
    const first=block.find(x=>x.i===meta.start)?.text||'';
    const hm=first.match(/^\s*(1[0-8]|[1-9])[\s.、)）:-]+(.{2,24})$/);
    const num=hm?Number(hm[1]):null;
    const name=hm?escName(hm[2]):null;
    const sa=sexAge(text), hw=horseWeight(text);
    const errors=[], warnings=[];
    if(!num) errors.push({code:'HORSE_NUMBER_MISSING',message:'馬番を特定できません'});
    if(!name) errors.push({code:'HORSE_NAME_MISSING',message:'馬名を特定できません'});
    if(!sa) warnings.push({code:'SEX_AGE_MISSING',message:'性齢を特定できません'});
    if(!hw) warnings.push({code:'WEIGHT_MISSING',message:'馬体重を特定できません'});
    return {frame:null,horseNumber:num,name,sex:sa?.sex||null,age:sa?.age||null,coatColor:null,weight:hw?.weight||null,jockey:jockey(text),trainer:null,confidence:meta.confidence,source:'JRA_COPY',warnings,errors};
  }
  function parsePastRun(block, dateIdx){
    const before=block.slice(Math.max(0,dateIdx-1),Math.min(block.length,dateIdx+10)).map(x=>x.text).join(' ');
    const all=block.map(x=>x.text).join(' ');
    const date=parseDate(block[dateIdx].text);
    const special=(all.match(STATUS_RE)||[])[0]||null;
    const fi=fieldInfo(before)||fieldInfo(all);
    const di=distance(before)||distance(all);
    const result=finish(before)||finish(all);
    const tw=horseWeight(before)||horseWeight(all);
    const tv=timeVal(before)||timeVal(all);
    const l3=last3f(before)||last3f(all);
    const cond=condition(before)||condition(all);
    const warnings=[];
    if(!special && !result)warnings.push({code:'FINISH_MISSING',message:'着順/特殊結果が特定できません'});
    if(!di)warnings.push({code:'DISTANCE_MISSING',message:'距離・芝ダートが特定できません'});
    return {date,track:trackName(before)||trackName(all),raceName:raceName(before)||raceName(all),finish:special?null:(result?.position??null),status:special||'FINISH',fieldSize:fi?.fieldSize??null,horseNumber:fi?.horseNumber??null,popularity:fi?.popularity??null,jockey:jockey(before)||jockey(all),carriedWeight:null,horseWeight:tw?.weight??null,horseWeightChange:tw?.change??null,distance:di?.distance??null,surface:di?.surface??null,trackCondition:cond,timeSeconds:tv,passingOrder:null,last3F:l3,margin:null,grade:null,source:'JRA_COPY',missing:{track:!(trackName(before)||trackName(all)),raceName:!(raceName(before)||raceName(all)),fieldSize:!fi?.fieldSize,horseNumber:!fi?.horseNumber,popularity:!fi?.popularity,jockey:!jockey(before),carriedWeight:true,horseWeight:!tw,distance:!di?.distance,surface:!di?.surface,trackCondition:!cond,timeSeconds:!tv,passingOrder:true,last3F:!l3,margin:true},warnings};
  }
  function parseRecent(block){
    const ds=[]; for(let i=0;i<block.length;i++)if(dateIn(block[i].text))ds.push(i);
    const runs=[];
    for(let k=0;k<Math.min(4,ds.length);k++){
      const start=ds[k], end=(ds[k+1]??Math.min(block.length,start+12));
      runs.push(parsePastRun(block.slice(start,end),0));
    }
    while(runs.length<4)runs.push(null);
    return runs;
  }
  function confidence(h){
    const fields=[h.horseNumber,h.name,h.sex,h.age,h.weight,h.jockey];
    const current=fields.filter(v=>v!=null).length/fields.length;
    const valid=h.recentRaces.filter(Boolean).length/4;
    let score=0.65*current+0.35*valid;
    if(h.errors.length)score-=.2;
    return score>=.82?'HIGH':score>=.62?'MEDIUM':'LOW';
  }
  function parse(rawText,raceInfo={}){
    const raw=String(rawText||'');
    const ls=lines(raw); const warnings=[], errors=[];
    if(!raw.trim()) return emptyResult(raw,raceInfo,[{code:'EMPTY_INPUT',message:'貼り付けデータが空です'}]);
    const blocks=detectHorseBlocks(ls);
    if(!blocks.length){ return emptyResult(raw,raceInfo,[{code:'HORSE_BLOCK_NOT_FOUND',message:'出走馬ブロックを検出できませんでした'}]); }
    const horses=[];
    for(const b of blocks){
      const block=ls.slice(b.start,b.end);
      const h=parseCurrent(block,b); h.recentRaces=parseRecent(block); h.confidence=confidence(h); horses.push(h);
      h.warnings.forEach(x=>warnings.push({...x,horseNumber:h.horseNumber}));
      h.errors.forEach(x=>errors.push({...x,horseNumber:h.horseNumber}));
    }
    const nums=horses.map(h=>h.horseNumber).filter(Boolean); const dup=nums.filter((n,i)=>nums.indexOf(n)!==i);
    if(dup.length)warnings.push({code:'DUPLICATE_HORSE_NUMBER',message:`馬番重複: ${uniq(dup).join(', ')}`});
    if(horses.length>18)warnings.push({code:'HORSE_COUNT_HIGH',message:`出走馬候補が${horses.length}頭あります。ブロック誤検出を確認してください`});
    const valid=horses.flatMap(h=>h.recentRaces).filter(r=>r && r.status==='FINISH').length;
    const special=horses.flatMap(h=>h.recentRaces).filter(r=>r && SPECIAL.includes(r.status)).length;
    const overall=errors.length?'MEDIUM':horses.some(h=>h.confidence==='LOW')?'MEDIUM':'HIGH';
    return {version:'1.1.0',parsedAt:new Date().toISOString(),raceInfo,source:{type:'JRA_COPY',rawText:raw,normalizedText:normalizeText(raw)},summary:{horseCount:horses.length,runsDetected:horses.flatMap(h=>h.recentRaces).filter(Boolean).length,validRuns:valid,specialResults:special,errorCount:errors.length,warningCount:warnings.length,confidence:overall},horses,warnings,errors,manualOverrides:{}};
  }
  function emptyResult(raw,raceInfo,errors){return {version:'1.1.0',parsedAt:new Date().toISOString(),raceInfo,source:{type:'JRA_COPY',rawText:raw,normalizedText:normalizeText(raw)},summary:{horseCount:0,runsDetected:0,validRuns:0,specialResults:0,errorCount:errors.length,warningCount:0,confidence:'LOW'},horses:[],warnings:[],errors,manualOverrides:{}};}
  global.JRAParser={VERSION:'1.1.0',parse,normalizeText,detectHorseBlocks};
})(window);
