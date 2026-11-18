/* ===== Validated dermatology scoring engines (pure functions) ===== */
const r1 = x => Math.round(x * 10) / 10;
const AREA6 = [['0','0%'],['1','<10%'],['2','10–29%'],['3','30–49%'],['4','50–69%'],['5','70–89%'],['6','90–100%']];
const SEV4 = [['0','0 None'],['1','1 Slight'],['2','2 Moderate'],['3','3 Marked'],['4','4 Very marked']];
const SEV3 = [['0','0'],['0.5','0.5'],['1','1'],['1.5','1.5'],['2','2'],['2.5','2.5'],['3','3']];
const n = v => +v || 0;

const SCORES = {
 PASI: {
  full:'Psoriasis Area & Severity Index', max:72,
  regions:[['head','Head & neck',0.1],['ul','Upper limbs',0.2],['trunk','Trunk',0.3],['ll','Lower limbs',0.4]],
  signs:[['e','Erythema'],['i','Induration'],['s','Desquamation']],
  calc(v){ let t=0; for(const [k,,w] of this.regions){ const r=v[k]||{}; t+=w*(n(r.e)+n(r.i)+n(r.s))*n(r.a); } return r1(t); },
  band(t){ return t<5?'Mild':t<=10?'Moderate':'Severe'; }
 },
 EASI: {
  full:'Eczema Area & Severity Index', max:72,
  regions:[['head','Head & neck'],['ul','Upper limbs'],['trunk','Trunk'],['ll','Lower limbs']],
  w(child){ return child?{head:0.2,ul:0.2,trunk:0.3,ll:0.3}:{head:0.1,ul:0.2,trunk:0.3,ll:0.4}; },
  signs:[['e','Erythema'],['p','Oedema / papulation'],['x','Excoriation'],['l','Lichenification']],
  calc(v){ const W=this.w(v.child); let t=0; for(const [k] of this.regions){ const r=v[k]||{}; t+=W[k]*(n(r.e)+n(r.p)+n(r.x)+n(r.l))*n(r.a); } return r1(t); },
  band(t){ return t===0?'Clear':t<=1?'Almost clear':t<=7?'Mild':t<=21?'Moderate':t<=50?'Severe':'Very severe'; }
 },
 SCORAD: {
  full:'SCORing Atopic Dermatitis', max:103,
  regionsAdult:[['hn','Head & neck',9],['ula','Upper limb R',9],['ulb','Upper limb L',9],['tf','Trunk front',18],['tb','Trunk back',18],['lla','Lower limb R',18],['llb','Lower limb L',18],['gen','Genitals',1]],
  regionsChild:[['hn','Head & neck',17],['ula','Upper limb R',9],['ulb','Upper limb L',9],['tf','Trunk front',18],['tb','Trunk back',18],['lla','Lower limb R',12],['llb','Lower limb L',12],['gen','Genitals',1]],
  items:[['er','Erythema'],['ed','Oedema / papulation'],['oo','Oozing / crusts'],['ex','Excoriation'],['li','Lichenification'],['dr','Dryness (uninvolved skin)']],
  bsa(v){ if(v.bsaOverride!==undefined && v.bsaOverride!=='') return Math.min(100,n(v.bsaOverride)); const R=v.child?this.regionsChild:this.regionsAdult; let a=0; for(const [k,,w] of R) a+=w*Math.min(100,n((v.reg||{})[k]))/100; return Math.min(100,a); },
  calc(v){ const A=this.bsa(v); let B=0; for(const [k] of this.items) B+=n((v.int||{})[k]); const C=n(v.itch)+n(v.sleep); return r1(A/5+3.5*B+C); },
  objective(v){ const A=this.bsa(v); let B=0; for(const [k] of this.items) B+=n((v.int||{})[k]); return r1(A/5+3.5*B); },
  band(t){ return t<25?'Mild':t<=50?'Moderate':'Severe'; }
 },
 SALT: {
  full:'Severity of Alopecia Tool', max:100,
  regions:[['top','Top / vertex',0.40],['back','Posterior',0.24],['right','Right side',0.18],['left','Left side',0.18]],
  calc(v){ let t=0; for(const [k,,w] of this.regions) t+=w*Math.min(100,n(v[k])); return r1(t); },
  band(t){ return t<=20?'S1 (≤20% — limited)':t<=49?'S2 (21–49% — moderate)':t<=74?'S3 (50–74% — severe)':t<=99?'S4 (75–99% — very severe)':'S5 (100%)'; }
 },
 MASI: {
  full:'Melasma Area & Severity Index', max:48,
  regions:[['f','Forehead',0.3],['rm','Right malar',0.3],['lm','Left malar',0.3],['c','Chin',0.1]],
  calc(v){ let t=0; for(const [k,,w] of this.regions){ const r=v[k]||{}; t+=w*n(r.a)*(n(r.d)+n(r.h)); } return r1(t); },
  band(t){ return t<16?'Mild':t<=32?'Moderate':'Severe'; }
 },
 mMASI: {
  full:'Modified MASI (area × darkness)', max:24,
  regions:[['f','Forehead',0.3],['rm','Right malar',0.3],['lm','Left malar',0.3],['c','Chin',0.1]],
  calc(v){ let t=0; for(const [k,,w] of this.regions){ const r=v[k]||{}; t+=w*n(r.a)*n(r.d); } return r1(t); },
  band(t){ return t<8?'Mild':t<=16?'Moderate':'Severe'; }
 },
 VASI: {
  full:'Vitiligo Area Scoring Index', max:100,
  regions:[['hands','Hands'],['ue','Upper extremities (excl. hands)'],['trunk','Trunk'],['le','Lower extremities (excl. feet)'],['feet','Feet'],['hn','Head & neck']],
  depig:[['100','100% (no pigment)'],['90','90% (specks)'],['75','75%'],['50','50%'],['25','25%'],['10','10% (specks of depigmentation)'],['0','0%']],
  calc(v){ let t=0; for(const [k] of this.regions){ const r=v[k]||{}; t+=n(r.hu)*n(r.dp)/100; } return Math.round(t*100)/100; },
  band(t){ return ''; }
 },
 GAGS: {
  full:'Global Acne Grading System', max:44,
  regions:[['fh','Forehead',2],['rc','Right cheek',2],['lc','Left cheek',2],['no','Nose',1],['ch','Chin',1],['cb','Chest & upper back',3]],
  grades:[['0','0 None'],['1','1 Comedones'],['2','2 Papules'],['3','3 Pustules'],['4','4 Nodules']],
  calc(v){ let t=0; for(const [k,,f] of this.regions) t+=f*n(v[k]); return t; },
  band(t){ return t===0?'None':t<=18?'Mild':t<=30?'Moderate':t<=38?'Severe':'Very severe'; }
 },
 DLQI: {
  full:'Dermatology Life Quality Index (item summary — use the licensed official form for thesis data)', max:30,
  /* Short item summaries only; the official questionnaire wording is © Finlay & Khan / Cardiff University */
  items:['Itch, soreness, pain or stinging','Embarrassment / self-consciousness','Interference with shopping, home or garden','Influence on clothes worn','Social or leisure activities','Difficulty with sport','Work or study (prevented = 3)','Problems with partner, friends or relatives','Sexual difficulties','Problems caused by treatment'],
  opts:[['3','Very much / Prevented'],['2','A lot'],['1','A little'],['0','Not at all'],['0n','Not relevant']],
  calc(v){ let t=0; for(let i=0;i<10;i++) t+=parseInt(v['q'+i])||0; return t; },
  band(t){ return t<=1?'No effect':t<=5?'Small effect':t<=10?'Moderate effect':t<=20?'Very large effect':'Extremely large effect'; }
 }
};
const VIDA = [['4','+4 Active ≤ 6 weeks'],['3','+3 Active 6 weeks–3 months'],['2','+2 Active 3–6 months'],['1','+1 Active 6–12 months'],['0','0 Stable ≥ 1 year'],['-1','−1 Stable ≥ 1 year with spontaneous repigmentation']];

const pctImprovement = (base, cur) => (base > 0 ? r1((base - cur) / base * 100) : null);

/* Isotretinoin cumulative dose */
function isoCalc(weight, daily, givenSoFar, targetPerKg) {
  const target = weight * targetPerKg;
  const remaining = Math.max(0, target - givenSoFar);
  return { target: Math.round(target), remaining: Math.round(remaining), days: daily > 0 ? Math.ceil(remaining / daily) : null, mgkg: weight ? r1(daily / weight * 100) / 100 : 0 };
}
/* Lignocaine maximum dose */
function lignoCalc(weight) {
  const plain = Math.min(4.5 * weight, 300), adr = Math.min(7 * weight, 500);
  return { plain: Math.round(plain), adr: Math.round(adr), plain1: r1(plain / 10), plain2: r1(plain / 20), adr1: r1(adr / 10), adr2: r1(adr / 20) };
}
/* Bacteriological index: mean of site gradings (0–6) */
const biCalc = arr => { const v = arr.filter(x => x !== '' && x != null).map(Number); return v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null; };

if (typeof module !== 'undefined') module.exports = { SCORES, pctImprovement, isoCalc, lignoCalc, biCalc };
