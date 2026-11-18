/* ===== Seed data: diagnoses, procedures, templates, formulary, checklists, thesis presets ===== */
const BUCKETS = ['Thesis Case','Thesis Control','Rare / Case Report','Clinical Meet','Exam Spotter','Logbook','Routine'];
const FST = ['I','II','III','IV','V','VI'];
const PHOTO_CATS = ['Clinical','Dermoscopy','Trichoscopy','Onychoscopy',"Wood's Lamp",'KOH','Tzanck','SSS','Gram stain','Histopath','Other'];

const DX = {
  D: ['Psoriasis','Atopic dermatitis','Seborrheic dermatitis','Allergic contact dermatitis','Irritant contact dermatitis','Hand eczema','Lichen planus','Lichen planus pigmentosus','Vitiligo','Melasma','Acne vulgaris','Rosacea','Alopecia areata','Androgenetic alopecia','Telogen effluvium','Urticaria','Angioedema','Dermatophytosis (Tinea)','Pityriasis versicolor','Cutaneous candidiasis','Onychomycosis','Scabies','Pediculosis','Impetigo','Furunculosis','Cellulitis','Herpes zoster','Herpes labialis','Viral warts','Molluscum contagiosum','Pemphigus vulgaris','Pemphigus foliaceus','Bullous pemphigoid','Dermatitis herpetiformis','SJS / TEN','DRESS','Fixed drug eruption','Maculopapular drug rash','DLE','SLE','Morphea','Systemic sclerosis','Dermatomyositis','Pityriasis rosea','Prurigo nodularis','Lichen simplex chronicus','Ichthyosis','Keloid / Hypertrophic scar','Hidradenitis suppurativa','PMLE','Seborrheic keratosis','Melanocytic nevus','BCC','SCC','Melanoma','Cutaneous TB','Mycetoma','Chromoblastomycosis','Sporotrichosis','Xerosis','Intertrigo','Periorbital hyperpigmentation','Pityriasis alba','Lichen sclerosus'],
  V: ['Syphilis – primary','Syphilis – secondary','Latent syphilis','Gonorrhoea','Non-gonococcal urethritis','Chancroid','LGV','Donovanosis','Genital herpes','Genital warts','Genital molluscum','Candidal balanoposthitis','Vaginal discharge syndrome','Genital scabies','HIV-associated dermatosis'],
  L: ['Leprosy – TT','Leprosy – BT','Leprosy – BB','Leprosy – BL','Leprosy – LL','Leprosy – Pure neuritic','Leprosy – Indeterminate','Type 1 lepra reaction','Type 2 lepra reaction (ENL)','Lucio phenomenon','Trophic ulcer','Post-MDT relapse'],
  A: ['Acne scars','Post-inflammatory hyperpigmentation','Photoaging','Hair loss consult','Laser hair reduction','Chemical peel','Tattoo removal','Skin tag / DPN removal','Hyperhidrosis','Striae','Dark circles']
};
const DX_CAT = {D:'Dermatology',V:'Venereology',L:'Leprosy',A:'Aesthetics'};
const dxCategory = name => { for (const k in DX) if (DX[k].includes(name)) return k; return 'D'; };

/* Default targets are placeholders — set them to your department / NMC curriculum expectations in Logbook → Targets */
const PROCEDURES = [
  ['Punch biopsy','Biopsy',15],['Incisional biopsy','Biopsy',5],['Excisional biopsy','Biopsy',5],['Shave biopsy','Biopsy',5],['Nerve biopsy','Biopsy',2],['Nail biopsy','Biopsy',2],
  ['Slit skin smear','Bedside test',20],['KOH mount','Bedside test',30],['Tzanck smear','Bedside test',10],['Gram stain','Bedside test',10],["Wood's lamp exam",'Bedside test',10],['Dermoscopy','Bedside test',30],['Patch test','Bedside test',10],['Prick test','Bedside test',5],['Dark ground microscopy','Bedside test',2],
  ['Electrocautery / RF','Dermatosurgery',20],['Radiofrequency ablation','Dermatosurgery',10],['Cryotherapy','Dermatosurgery',20],['Excision & suturing','Dermatosurgery',5],['Comedone extraction','Dermatosurgery',10],['Acne surgery','Dermatosurgery',5],['Nail avulsion / surgery','Dermatosurgery',3],['Ear lobe repair','Dermatosurgery',2],['Subcision','Dermatosurgery',5],
  ['Intralesional steroid','Injection',20],['Intralesional immunotherapy','Injection',10],['Botulinum toxin','Injection',3],['Filler','Injection',2],
  ['Chemical peel','Aesthetic',15],['PRP','Aesthetic',10],['Microneedling','Aesthetic',10],['Microdermabrasion','Aesthetic',5],
  ['Q-switched Nd:YAG laser','Laser',5],['Fractional CO2 laser','Laser',5],['Laser hair reduction','Laser',5],
  ['NB-UVB phototherapy session','Phototherapy',20],['Excimer / targeted phototherapy','Phototherapy',5],
  ['Suction blister grafting','Vitiligo surgery',3],['Punch grafting','Vitiligo surgery',3],['Split-thickness grafting','Vitiligo surgery',2],['Non-cultured melanocyte transfer','Vitiligo surgery',2]
];
const ROLES = ['Performed','Assisted','Observed'];

const INV_TYPES = ['Skin biopsy (HPE)','Slit skin smear','KOH mount','Fungal culture','Patch test','ANA / ENA','DIF','Indirect IF / ELISA','Tzanck smear','Gram stain','VDRL / TPHA','HIV / HBsAg / HCV','CBC / LFT / RFT','Lipid profile','Other'];
const INV_DAYS = {'Skin biopsy (HPE)':10,'Slit skin smear':2,'KOH mount':0,'Fungal culture':21,'Patch test':4,'ANA / ENA':5,'DIF':10,'Indirect IF / ELISA':7,'Tzanck smear':0,'Gram stain':0,'VDRL / TPHA':2,'HIV / HBsAg / HCV':1,'CBC / LFT / RFT':1,'Lipid profile':1,'Other':5};

const REMINDER_TYPES = ['Thesis follow-up','Phototherapy session','Suture removal','HPE report collection','Review visit','Lab report','Other'];

/* ---------- WhatsApp care templates: en / hi / te. Placeholders: {name} {date} {plan} ---------- */
const WA_TEMPLATES = [
 {id:'biopsy', title:'Post-biopsy care',
  en:`Dear {name}, after your skin biopsy today:
• Keep the dressing dry for 24 hours.
• Then wash gently with soap and water once a day, pat dry and apply the prescribed ointment.
• Avoid stretching the area or heavy exercise.
• Suture removal on {date}.
• Come back early if there is bleeding, pus, increasing pain or redness, or fever.
The biopsy report takes about 7–10 days.
— Dept. of Dermatology`,
  hi:`प्रिय {name}, आज त्वचा की बायोप्सी के बाद:
• 24 घंटे तक पट्टी को सूखा रखें।
• फिर रोज़ एक बार साबुन-पानी से धीरे से धोएँ, थपथपाकर सुखाएँ और दी गई मलहम लगाएँ।
• उस जगह पर खिंचाव या भारी व्यायाम न करें।
• टांके {date} को निकाले जाएँगे।
• खून आना, मवाद, दर्द या लालिमा बढ़ना, या बुखार हो तो जल्दी आएँ।
बायोप्सी रिपोर्ट लगभग 7–10 दिन में आती है।
— त्वचा रोग विभाग`,
  te:`ప్రియమైన {name}, ఈ రోజు చర్మ బయాప్సీ తర్వాత:
• 24 గంటల వరకు కట్టు తడవకుండా ఉంచండి.
• తర్వాత రోజుకు ఒకసారి సబ్బు, నీటితో మెల్లగా కడిగి, తుడిచి, ఇచ్చిన ఆయింట్‌మెంట్ రాయండి.
• ఆ భాగాన్ని సాగదీయవద్దు, బరువైన వ్యాయామం చేయవద్దు.
• కుట్లు {date} న తీస్తారు.
• రక్తం కారడం, చీము, నొప్పి లేదా ఎరుపు పెరగడం, జ్వరం ఉంటే ముందుగానే రండి.
బయాప్సీ రిపోర్ట్ సుమారు 7–10 రోజుల్లో వస్తుంది.
— చర్మ వ్యాధుల విభాగం`},
 {id:'scabies', title:'Scabies treatment & hygiene',
  en:`Dear {name}, for scabies treatment:
• Apply the cream at night from neck to toes — including between fingers and toes, under nails and the genitals. Wash off after 8–12 hours.
• Repeat after 7 days.
• ALL family members and close contacts must apply it on the same night, even without itching.
• Wash clothes, bedsheets and towels used in the last 3 days in hot water and dry in the sun. Items that cannot be washed: keep sealed in a bag for 3 days.
• Itching can continue for 2–4 weeks after treatment; this is expected.
— Dept. of Dermatology`,
  hi:`प्रिय {name}, खुजली (स्केबीज़) के इलाज के लिए:
• रात को क्रीम गर्दन से पैर की उँगलियों तक लगाएँ — उँगलियों के बीच, नाखूनों के नीचे और गुप्तांगों पर भी। 8–12 घंटे बाद धो लें।
• 7 दिन बाद फिर से लगाएँ।
• घर के सभी सदस्य और करीबी लोग उसी रात क्रीम लगाएँ, चाहे खुजली न हो।
• पिछले 3 दिनों में इस्तेमाल किए कपड़े, चादरें और तौलिये गर्म पानी में धोकर धूप में सुखाएँ। जो न धुल सकें, उन्हें 3 दिन थैली में बंद रखें।
• इलाज के बाद 2–4 हफ्ते तक खुजली रह सकती है, यह सामान्य है।
— त्वचा रोग विभाग`,
  te:`ప్రియమైన {name}, గజ్జి (స్కేబీస్) చికిత్స కోసం:
• రాత్రి క్రీమ్‌ను మెడ నుండి కాలి వేళ్ల వరకు రాయండి — వేళ్ల మధ్య, గోళ్ల కింద, జననాంగాల మీద కూడా. 8–12 గంటల తర్వాత కడిగేయండి.
• 7 రోజుల తర్వాత మళ్లీ రాయండి.
• ఇంట్లో అందరూ, దగ్గరి వారు అదే రాత్రి క్రీమ్ రాయాలి, దురద లేకపోయినా.
• గత 3 రోజుల్లో వాడిన బట్టలు, దుప్పట్లు, టవల్స్ వేడి నీటిలో ఉతికి ఎండలో ఆరబెట్టండి. ఉతకలేని వాటిని 3 రోజులు సంచిలో మూసి ఉంచండి.
• చికిత్స తర్వాత 2–4 వారాలు దురద ఉండవచ్చు, ఇది సహజం.
— చర్మ వ్యాధుల విభాగం`},
 {id:'steroid', title:'Topical steroid use & taper',
  en:`Dear {name}, about your steroid cream:
• Apply a thin layer only on the affected areas: {plan}.
• Use the fingertip amount shown to you. Do not apply on the face or skin folds unless told.
• Do not stop suddenly — reduce as advised.
• Do not share it or buy it again without a prescription. Never use it as a fairness cream.
• Review on {date}.
— Dept. of Dermatology`,
  hi:`प्रिय {name}, आपकी स्टेरॉयड क्रीम के बारे में:
• केवल प्रभावित जगह पर पतली परत लगाएँ: {plan}।
• बताई गई उँगली-भर मात्रा ही लगाएँ। बिना सलाह चेहरे या त्वचा की सिलवटों पर न लगाएँ।
• अचानक बंद न करें — सलाह के अनुसार धीरे-धीरे कम करें।
• दूसरों को न दें, बिना पर्ची दोबारा न खरीदें। इसे गोरापन क्रीम की तरह कभी न लगाएँ।
• दोबारा दिखाएँ: {date}।
— त्वचा रोग विभाग`,
  te:`ప్రియమైన {name}, మీ స్టెరాయిడ్ క్రీమ్ గురించి:
• సమస్య ఉన్న చోట మాత్రమే పలుచగా రాయండి: {plan}.
• చూపించిన వేలి కొన పరిమాణం మాత్రమే వాడండి. డాక్టర్ చెప్పకుండా ముఖం మీద, ముడతల్లో రాయవద్దు.
• ఒక్కసారిగా ఆపవద్దు — చెప్పిన విధంగా తగ్గించండి.
• ఇతరులకు ఇవ్వవద్దు, ప్రిస్క్రిప్షన్ లేకుండా మళ్లీ కొనవద్దు. ఫెయిర్‌నెస్ క్రీమ్‌గా ఎప్పుడూ వాడవద్దు.
• మళ్లీ చూపించుకోవాల్సిన తేదీ: {date}.
— చర్మ వ్యాధుల విభాగం`},
 {id:'isotretinoin', title:'Isotretinoin precautions',
  en:`Dear {name}, important precautions with isotretinoin:
• Take it with food, exactly as prescribed.
• It can seriously harm an unborn baby. Women must not become pregnant during treatment or for 1 month after stopping — use reliable contraception.
• Do not donate blood during treatment or for 1 month after.
• Use moisturiser, lip balm and sunscreen daily. Avoid waxing, laser and peels during treatment.
• Avoid alcohol. No vitamin A supplements or tetracycline antibiotics unless prescribed.
• Do the blood tests as advised.
• Tell the doctor at once if you have low mood, severe headache, blurred vision or severe stomach pain.
Next review: {date}.
— Dept. of Dermatology`,
  hi:`प्रिय {name}, आइसोट्रेटिनॉइन के साथ ज़रूरी सावधानियाँ:
• दवा खाने के साथ, बताए अनुसार ही लें।
• यह गर्भ में बच्चे को गंभीर नुकसान पहुँचा सकती है। महिलाएँ इलाज के दौरान और बंद करने के 1 महीने बाद तक गर्भधारण न करें — भरोसेमंद गर्भनिरोधक अपनाएँ।
• इलाज के दौरान और 1 महीने बाद तक रक्तदान न करें।
• रोज़ मॉइस्चराइज़र, लिप बाम और सनस्क्रीन लगाएँ। इलाज के दौरान वैक्सिंग, लेज़र और पील न कराएँ।
• शराब से बचें। बिना सलाह विटामिन A या टेट्रासाइक्लिन दवाएँ न लें।
• बताए गए खून के टेस्ट करवाएँ।
• उदासी, तेज़ सिरदर्द, धुंधला दिखना या पेट में तेज़ दर्द हो तो तुरंत डॉक्टर को बताएँ।
अगली जाँच: {date}।
— त्वचा रोग विभाग`,
  te:`ప్రియమైన {name}, ఐసోట్రెటినోయిన్‌తో ముఖ్యమైన జాగ్రత్తలు:
• మందును భోజనంతో, చెప్పిన విధంగానే వేసుకోండి.
• ఇది కడుపులోని బిడ్డకు తీవ్రమైన హాని చేయవచ్చు. మహిళలు చికిత్స సమయంలో, ఆపిన తర్వాత 1 నెల వరకు గర్భం దాల్చకూడదు — నమ్మకమైన గర్భనిరోధకం వాడండి.
• చికిత్స సమయంలో, తర్వాత 1 నెల వరకు రక్తదానం చేయవద్దు.
• రోజూ మాయిశ్చరైజర్, లిప్ బామ్, సన్‌స్క్రీన్ వాడండి. చికిత్స సమయంలో వాక్సింగ్, లేజర్, పీల్స్ చేయించుకోవద్దు.
• మద్యం తాగవద్దు. డాక్టర్ చెప్పకుండా విటమిన్ A లేదా టెట్రాసైక్లిన్ మందులు వాడవద్దు.
• చెప్పిన రక్త పరీక్షలు చేయించుకోండి.
• మనసు బాగోలేకపోవడం, తీవ్రమైన తలనొప్పి, చూపు మసకబారడం, తీవ్రమైన కడుపు నొప్పి ఉంటే వెంటనే డాక్టర్‌కు చెప్పండి.
తదుపరి సమీక్ష: {date}.
— చర్మ వ్యాధుల విభాగం`},
 {id:'sunscreen', title:'Sunscreen usage',
  en:`Dear {name}, how to use sunscreen:
• Use SPF 30 or more, broad spectrum (PA+++).
• Apply 15–20 minutes before going out — about 2 finger-lengths for the face and neck.
• Reapply every 2–3 hours outdoors and after sweating or washing.
• Use it every day, including indoors near windows and on cloudy days.
• Also use an umbrella or cap and avoid the sun between 10 am and 4 pm.
— Dept. of Dermatology`,
  hi:`प्रिय {name}, सनस्क्रीन कैसे लगाएँ:
• SPF 30 या ज़्यादा, ब्रॉड स्पेक्ट्रम (PA+++) वाली सनस्क्रीन लें।
• बाहर जाने से 15–20 मिनट पहले लगाएँ — चेहरे और गर्दन के लिए लगभग 2 उँगली-भर।
• बाहर हों तो हर 2–3 घंटे में और पसीने या मुँह धोने के बाद दोबारा लगाएँ।
• रोज़ लगाएँ — घर में खिड़की के पास और बादल वाले दिन भी।
• छाता या टोपी लें और सुबह 10 से शाम 4 बजे तक धूप से बचें।
— त्वचा रोग विभाग`,
  te:`ప్రియమైన {name}, సన్‌స్క్రీన్ ఎలా వాడాలి:
• SPF 30 లేదా అంతకంటే ఎక్కువ, బ్రాడ్ స్పెక్ట్రమ్ (PA+++) సన్‌స్క్రీన్ వాడండి.
• బయటకు వెళ్లే 15–20 నిమిషాల ముందు రాయండి — ముఖం, మెడకు సుమారు 2 వేళ్ల పొడవు.
• బయట ఉన్నప్పుడు ప్రతి 2–3 గంటలకు, చెమట పట్టిన తర్వాత లేదా ముఖం కడిగిన తర్వాత మళ్లీ రాయండి.
• ప్రతి రోజూ వాడండి — ఇంట్లో కిటికీ దగ్గర, మబ్బుగా ఉన్న రోజుల్లో కూడా.
• గొడుగు లేదా టోపీ వాడండి, ఉదయం 10 నుండి సాయంత్రం 4 వరకు ఎండకు దూరంగా ఉండండి.
— చర్మ వ్యాధుల విభాగం`},
 {id:'tinea', title:'Fungal infection (tinea) hygiene',
  en:`Dear {name}, for your fungal infection (ringworm):
• Take and apply the medicines for the full course, even if the rash fades early.
• Keep skin folds dry; dry well after bathing; wear loose cotton clothes.
• Do not share towels, clothes or soap. Wash clothes in hot water, dry in sunlight and iron them if possible.
• Do NOT use steroid or combination creams bought over the counter.
• Family members with similar rashes should also be treated.
Review on {date}.
— Dept. of Dermatology`,
  hi:`प्रिय {name}, आपके फंगल संक्रमण (दाद) के लिए:
• दवाएँ पूरा कोर्स लें और लगाएँ, चाहे दाने जल्दी ठीक हो जाएँ।
• त्वचा की सिलवटों को सूखा रखें, नहाने के बाद अच्छे से पोंछें, ढीले सूती कपड़े पहनें।
• तौलिया, कपड़े या साबुन साझा न करें। कपड़े गर्म पानी में धोएँ, धूप में सुखाएँ और हो सके तो प्रेस करें।
• दुकान से स्टेरॉयड या मिली-जुली क्रीम न खरीदें।
• परिवार में किसी को ऐसे ही दाने हों तो उनका भी इलाज कराएँ।
दोबारा दिखाएँ: {date}।
— त्वचा रोग विभाग`,
  te:`ప్రియమైన {name}, మీ ఫంగల్ ఇన్ఫెక్షన్ (తామర) కోసం:
• దద్దుర్లు త్వరగా తగ్గినా మందులు పూర్తి కోర్సు వాడండి.
• చర్మపు ముడతలను పొడిగా ఉంచండి, స్నానం తర్వాత బాగా తుడవండి, వదులుగా ఉండే కాటన్ బట్టలు వేసుకోండి.
• టవల్, బట్టలు, సబ్బు ఇతరులతో పంచుకోవద్దు. బట్టలను వేడి నీటిలో ఉతికి, ఎండలో ఆరబెట్టి, వీలైతే ఇస్త్రీ చేయండి.
• షాపులో స్టెరాయిడ్ లేదా మిక్స్‌డ్ క్రీమ్‌లు కొని వాడవద్దు.
• ఇంట్లో ఎవరికైనా ఇలాంటి దద్దుర్లు ఉంటే వారికీ చికిత్స చేయించండి.
మళ్లీ చూపించుకోవాల్సిన తేదీ: {date}.
— చర్మ వ్యాధుల విభాగం`},
 {id:'followup', title:'Follow-up reminder',
  en:`Dear {name}, this is a reminder of your follow-up visit at the Dermatology OPD on {date}. Please bring your OPD card, previous prescriptions and reports.
— Dept. of Dermatology`,
  hi:`प्रिय {name}, याद दिला रहे हैं कि {date} को त्वचा रोग OPD में आपकी दोबारा जाँच है। कृपया OPD कार्ड, पुरानी पर्चियाँ और रिपोर्ट साथ लाएँ।
— त्वचा रोग विभाग`,
  te:`ప్రియమైన {name}, {date} న చర్మ వ్యాధుల OPD లో మీ ఫాలో-అప్ ఉందని గుర్తు చేస్తున్నాం. దయచేసి OPD కార్డ్, పాత ప్రిస్క్రిప్షన్లు, రిపోర్టులు తీసుకురండి.
— చర్మ వ్యాధుల విభాగం`},
 {id:'report', title:'Report collection',
  en:`Dear {name}, your biopsy/lab report should be ready by {date}. Please come to the Dermatology OPD with your OPD card to collect it and discuss the result.
— Dept. of Dermatology`,
  hi:`प्रिय {name}, आपकी बायोप्सी/लैब रिपोर्ट {date} तक तैयार हो जानी चाहिए। रिपोर्ट लेने और नतीजे पर बात करने के लिए OPD कार्ड के साथ त्वचा रोग OPD में आएँ।
— त्वचा रोग विभाग`,
  te:`ప్రియమైన {name}, మీ బయాప్సీ/ల్యాబ్ రిపోర్ట్ {date} నాటికి సిద్ధంగా ఉంటుంది. రిపోర్ట్ తీసుకుని ఫలితం గురించి మాట్లాడేందుకు OPD కార్డ్‌తో చర్మ వ్యాధుల OPD కి రండి.
— చర్మ వ్యాధుల విభాగం`}
];

/* ---------- Personal formulary (seed — editable; verify every dose against current guidelines/label) ---------- */
const FORMULARY_SEED = [
 {id:'iso',name:'Isotretinoin',cls:'Retinoid',kg:[0.25,1],per:'mg/kg/day',max:null,adult:'0.25–0.5 mg/kg/day (low dose) up to 0.5–1 mg/kg/day',notes:'Target cumulative 120–150 mg/kg (use calculator). Pregnancy test + contraception from 1 month before to 1 month after. Avoid tetracyclines, vitamin A.',monitor:'LFT, fasting lipids at baseline and 1–2 months; mood'},
 {id:'mtx',name:'Methotrexate',cls:'Antimetabolite',kg:[0.2,0.7],per:'mg/kg/WEEK',max:25,adult:'7.5–25 mg once WEEKLY (test dose 2.5–5 mg)',notes:'Weekly dosing only. Folic acid 5 mg on non-MTX days (or weekly). Avoid in pregnancy; men and women to stop ≥3 months before conception.',monitor:'CBC, LFT, RFT at baseline, then 2–4 weekly initially; track cumulative dose'},
 {id:'dap',name:'Dapsone',cls:'Sulfone',kg:[1,2],per:'mg/kg/day',max:200,adult:'50–100 mg/day (DH up to 200 mg)',notes:'Check G6PD before starting. Watch for haemolysis, methaemoglobinaemia, DRESS (dapsone hypersensitivity syndrome).',monitor:'CBC weekly × 4, then monthly; LFT'},
 {id:'csa',name:'Cyclosporine',cls:'Calcineurin inhibitor',kg:[2.5,5],per:'mg/kg/day',max:null,adult:'2.5–5 mg/kg/day in 2 divided doses',notes:'Short courses preferred; taper. Many drug interactions (CYP3A4).',monitor:'BP and creatinine every 2 weeks initially; K+, Mg2+, lipids'},
 {id:'aza',name:'Azathioprine',cls:'Immunosuppressant',kg:[1,2.5],per:'mg/kg/day',max:null,adult:'1–2.5 mg/kg/day (adjust to TPMT activity)',notes:'Avoid with allopurinol (or reduce dose to 25%).',monitor:'TPMT if available; CBC, LFT'},
 {id:'pred',name:'Prednisolone',cls:'Systemic steroid',kg:[0.5,1],per:'mg/kg/day',max:null,adult:'0.5–1 mg/kg/day; taper',notes:'Calcium + vitamin D; GI protection where indicated; screen for TB/diabetes for long courses.',monitor:'BP, glucose, weight'},
 {id:'ivm',name:'Ivermectin',cls:'Antiparasitic',kg:[0.2,0.2],per:'mg/kg single dose',max:null,adult:'200 µg/kg single dose, repeat after 7–14 days',notes:'Avoid in children < 15 kg and in pregnancy/lactation.',monitor:''},
 {id:'terb',name:'Terbinafine',cls:'Antifungal',kg:null,per:'',max:null,adult:'250 mg/day',peds:'<20 kg: 62.5 mg; 20–40 kg: 125 mg; >40 kg: 250 mg daily',bands:[[0,20,'62.5 mg/day'],[20,40,'125 mg/day'],[40,999,'250 mg/day']],notes:'',monitor:'LFT if prolonged'},
 {id:'itra',name:'Itraconazole',cls:'Antifungal',kg:[3,5],per:'mg/kg/day',max:400,adult:'100–200 mg/day (with fatty meal)',notes:'Many CYP3A4 interactions; avoid in CHF.',monitor:'LFT if prolonged'},
 {id:'gris',name:'Griseofulvin (microsize)',cls:'Antifungal',kg:[20,25],per:'mg/kg/day',max:1000,adult:'500–1000 mg/day',notes:'Tinea capitis first line in children; take with fatty food; 6–8 weeks.',monitor:''},
 {id:'fluc',name:'Fluconazole',cls:'Antifungal',kg:[6,6],per:'mg/kg/day',max:400,adult:'150–300 mg once weekly (tinea / onychomycosis)',notes:'',monitor:''},
 {id:'acv',name:'Acyclovir',cls:'Antiviral',kg:[20,20],per:'mg/kg/dose QID',max:800,adult:'Zoster: 800 mg 5×/day × 7 days; HSV: 400 mg TDS',notes:'Adjust in renal impairment; hydrate.',monitor:'RFT in elderly'},
 {id:'valacv',name:'Valacyclovir',cls:'Antiviral',kg:null,per:'',max:null,adult:'Zoster: 1 g TDS × 7 days; HSV first episode: 1 g BD × 7–10 days',notes:'',monitor:''},
 {id:'doxy',name:'Doxycycline',cls:'Tetracycline',kg:null,per:'',max:null,adult:'100 mg OD–BD (acne: 100 mg OD)',notes:'Avoid < 8 years and in pregnancy. Photosensitivity; take with water upright.',monitor:''},
 {id:'hcq',name:'Hydroxychloroquine',cls:'Antimalarial',kg:[5,5],per:'mg/kg/day (actual body weight, MAX)',max:400,adult:'200–400 mg/day (≤5 mg/kg/day)',notes:'Dose ceiling is ≤5 mg/kg/day.',monitor:'Baseline + annual retinal screening after 5 years'},
 {id:'cet',name:'Cetirizine',cls:'Antihistamine',kg:null,per:'',max:null,adult:'10 mg OD (urticaria: up-dosing to 4× per guidelines)',peds:'2–5 y: 2.5 mg OD–BD; 6–11 y: 5–10 mg/day',notes:'',monitor:''},
 {id:'hydx',name:'Hydroxyzine',cls:'Antihistamine',kg:[1,2],per:'mg/kg/day in divided doses',max:100,adult:'10–25 mg HS–TDS',notes:'Sedating; QT caution.',monitor:''},
 {id:'bzp',name:'Benzathine penicillin G',cls:'Antibiotic',kg:[0.05,0.05],per:'MU/kg (child)',max:2.4,adult:'Early syphilis: 2.4 MU IM single dose (late: weekly × 3)',notes:'Test dose per local protocol.',monitor:''},
 {id:'mdt',name:'MDT – Leprosy (NLEP)',cls:'Antileprosy',kg:null,per:'',max:null,adult:'Adult MB: Rifampicin 600 mg + Clofazimine 300 mg monthly (supervised); Clofazimine 50 mg + Dapsone 100 mg daily',peds:'10–14 y: Rif 450 mg + Clofaz 150 mg monthly; Clofaz 50 mg alt. days + Dapsone 50 mg daily. <10 y: Rif 10 mg/kg, Clofaz 100 mg monthly + 50 mg twice weekly, Dapsone 2 mg/kg daily',notes:'Duration and PB regimen: check the current NLEP guideline (uniform 3-drug regimen for PB adopted in India).',monitor:''},
 {id:'apre',name:'Apremilast',cls:'PDE-4 inhibitor',kg:null,per:'',max:null,adult:'Titrate over 5 days to 30 mg BD',notes:'GI upset, weight loss, mood.',monitor:'Weight, mood'},
 {id:'tofa',name:'Tofacitinib',cls:'JAK inhibitor',kg:null,per:'',max:null,adult:'5 mg BD (off-label in vitiligo/AA)',notes:'Screen TB, hepatitis B/C, HIV; zoster risk.',monitor:'CBC, LFT, lipids'},
 {id:'ada',name:'Adalimumab',cls:'Biologic (TNF-α)',kg:null,per:'',max:null,adult:'Psoriasis: 80 mg wk 0, 40 mg wk 1, then 40 mg every other week. HS: 160 → 80 → 40 mg weekly',notes:'Screen latent TB, HBV/HCV, HIV before starting.',monitor:''},
 {id:'secu',name:'Secukinumab',cls:'Biologic (IL-17A)',kg:null,per:'',max:null,adult:'300 mg SC weeks 0–4, then every 4 weeks',notes:'Avoid in IBD.',monitor:''},
 {id:'dupi',name:'Dupilumab',cls:'Biologic (IL-4Rα)',kg:null,per:'',max:null,adult:'AD: 600 mg loading, then 300 mg every 2 weeks',notes:'Conjunctivitis.',monitor:''},
 {id:'omal',name:'Omalizumab',cls:'Biologic (anti-IgE)',kg:null,per:'',max:null,adult:'CSU: 300 mg SC every 4 weeks',notes:'',monitor:''},
 {id:'ritu',name:'Rituximab',cls:'Biologic (anti-CD20)',kg:null,per:'',max:null,adult:'Pemphigus (RA protocol): 1 g IV, repeat after 2 weeks',notes:'Screen HBV; premedicate.',monitor:'CBC, CD19 counts'},
 {id:'tx',name:'Tranexamic acid (oral)',cls:'Antifibrinolytic',kg:null,per:'',max:null,adult:'Melasma: 250 mg BD (off-label)',notes:'Avoid with history of thromboembolism, OCP use, smokers.',monitor:''},
 {id:'lmin',name:'Minoxidil (oral, low dose)',cls:'Vasodilator',kg:null,per:'',max:null,adult:'0.625–2.5 mg/day (off-label, hair loss)',notes:'Hypertrichosis, pedal oedema, tachycardia.',monitor:'BP, pulse'}
];

/* Fingertip units: adult areas (1 FTU ≈ 0.5 g) and children by age (Long & Finlay) */
const FTU_ADULT = [['Face & neck',2.5],['Front of trunk',7],['Back & buttocks',7],['One arm (excl. hand)',3],['One hand (both sides)',1],['One leg (excl. foot)',6],['One foot',2]];
const FTU_CHILD = { cols:['Face & neck','Arm & hand','Leg & foot','Front trunk','Back & buttocks'],
  rows:[['3–6 months',[1,1,1.5,1,1.5]],['1–2 years',[1.5,1.5,2,2,3]],['3–5 years',[1.5,2,3,3,3.5]],['6–10 years',[2,2.5,4.5,3.5,5]]] };

const COMPOUNDS = [
 {name:"Kligman's formula (original)",base:'Hydrophilic ointment / cream',parts:[['Hydroquinone',5],['Tretinoin',0.1],['Dexamethasone',0.1]]},
 {name:"Modified Kligman's",base:'Cream base',parts:[['Hydroquinone',4],['Tretinoin',0.05],['Mometasone furoate',0.1]]},
 {name:'Salicylic acid ointment',base:'White soft paraffin',parts:[['Salicylic acid',6]]},
 {name:"Whitfield's ointment",base:'Emulsifying ointment',parts:[['Benzoic acid',6],['Salicylic acid',3]]},
 {name:'Coal tar (LCD) ointment',base:'White soft paraffin',parts:[['Liquor carbonis detergens',5],['Salicylic acid',3]]},
 {name:'Precipitated sulfur (infant / pregnancy scabies)',base:'White soft paraffin',parts:[['Precipitated sulfur',6]]},
 {name:'Urea cream',base:'Cream base',parts:[['Urea',20]]}
];

const CHECKLISTS = [
 {name:'Punch biopsy', items:['Consent signed & site photographed','Site marked; biopsy from active edge / well-developed lesion','Punch size chosen (3 / 4 / 5 mm) + spare','Lignocaine 2% ± adrenaline drawn; max dose checked','Spirit / povidone-iodine, sterile drapes, gloves','Toothed forceps, curved scissors, needle holder','Suture (3-0 / 4-0 nylon; 5-0 for face) or gelfoam','10% formalin container labelled (+ Michel’s medium if DIF)','HPE requisition with clinical details & differentials','Dressing material ready']},
 {name:'Excision & suturing', items:['Consent & photo','Elliptical outline 3:1 marked along RSTL','Blade No. 15, scalpel handle','Lignocaine with adrenaline (check limits)','Skin hooks / Adson forceps, needle holder, scissors','Absorbable (4-0 / 5-0) + non-absorbable sutures','Electrocautery available for haemostasis','Specimen container + requisition','Pressure dressing']},
 {name:'Electrocautery / RF', items:['Consent; ask about pacemaker / implanted devices','No alcohol-based prep left wet (fire risk)','Earthing plate / correct electrode tips','Smoke evacuator / mask','Local anaesthesia or topical (EMLA) as needed','Antibiotic ointment & dressing']},
 {name:'Cryotherapy', items:['Liquid nitrogen level checked','Spray tips / cotton applicators','Freeze–thaw cycle plan noted','Post-procedure blister counselling given']},
 {name:'Chemical peel', items:['Consent + baseline photos','Priming done (2–4 weeks) & no active infection / HSV','Patch test where indicated','Degreasing (acetone / spirit)','Petrolatum to nasal alae, lips, eye canthi','Peel agent & concentration verified; timer ready','Neutraliser: glycolic → sodium bicarbonate; salicylic / Jessner self-neutralising; TCA → end-point frosting, no neutraliser','Cold water / fan, gauze','Post-peel sunscreen & emollient counselling']},
 {name:'PRP', items:['Consent; check platelets / anticoagulant use','Vacutainers with anticoagulant (ACD / citrate)','Centrifuge programme set (single / double spin)','Activator (calcium chloride) if used','Insulin syringes / dermaroller','Topical anaesthetic applied 45 min before']},
 {name:'Intralesional injection', items:['Triamcinolone acetonide (10 mg/mL; dilute to 2.5–5 mg/mL for face)','Insulin / 1 mL syringes, 30G needles','Max dose per session noted','Spirit swabs, gauze','Counsel about atrophy / hypopigmentation']},
 {name:'Nail surgery', items:['Consent; digital nerve block plan','Lignocaine PLAIN (no adrenaline)','Tourniquet (glove / Penrose)','Nail elevator, nail splitter, artery forceps','Phenol 88% (for matricectomy) if needed','Bulky dressing; elevation advice']},
 {name:'Vitiligo grafting', items:['Stability ≥ 12 months documented','Donor & recipient sites marked, photos','Suction blister device / punches (1–2 mm)','Dermabrasion / CO2 / micro-motor for recipient','Trypsin-EDTA kit if non-cultured transfer','Dressing (collagen / paraffin gauze)','Post-op NB-UVB plan']}
];

/* ---------- Thesis presets ---------- */
const THESIS_PRESETS = {
 blank:{title:'',scale:'',weeks:[0,4,8,12],vars:[]},
 psoriasis:{title:'Efficacy & safety of ___ vs ___ in chronic plaque psoriasis',scale:'PASI',weeks:[0,4,8,12],vars:[
  {name:'BSA_pct',label:'BSA involved (%)',type:'number',scope:'visit'},
  {name:'PGA',label:'PGA (0–4)',type:'select',options:'0,1,2,3,4',scope:'visit'},
  {name:'Nail_involve',label:'Nail involvement',type:'yesno',scope:'baseline'},
  {name:'PsA',label:'Psoriatic arthritis',type:'yesno',scope:'baseline'},
  {name:'LFT_ALT',label:'ALT (U/L)',type:'number',scope:'visit'},
  {name:'Hb',label:'Haemoglobin (g/dL)',type:'number',scope:'visit'}]},
 vitiligo:{title:'Efficacy of ___ in stable / active vitiligo',scale:'VASI',weeks:[0,4,8,12,16],vars:[
  {name:'VIDA',label:'VIDA score',type:'select',options:'4,3,2,1,0,-1',scope:'visit'},
  {name:'Type',label:'Vitiligo type',type:'select',options:'Non-segmental,Segmental,Focal,Mucosal,Mixed',scope:'baseline'},
  {name:'Koebner',label:'Koebner phenomenon',type:'yesno',scope:'baseline'},
  {name:'Repig_pct',label:'Repigmentation (%)',type:'number',scope:'visit'},
  {name:'Repig_pattern',label:'Repigmentation pattern',type:'select',options:'Perifollicular,Marginal,Diffuse,Mixed,None',scope:'visit'},
  {name:'Derm_trichrome',label:'Dermoscopy: trichrome pattern',type:'yesno',scope:'visit'},
  {name:'Derm_perifollicular',label:'Dermoscopy: perifollicular pigmentation',type:'yesno',scope:'visit'}]},
 melasma:{title:'Comparative study of ___ vs ___ in melasma',scale:'mMASI',weeks:[0,4,8,12],vars:[
  {name:'Pattern',label:'Clinical pattern',type:'select',options:'Centrofacial,Malar,Mandibular,Mixed',scope:'baseline'},
  {name:'Wood_type',label:"Wood's lamp type",type:'select',options:'Epidermal,Dermal,Mixed',scope:'baseline'},
  {name:'MELASQOL',label:'MELASQOL total',type:'number',scope:'visit'},
  {name:'Derm_pigment_network',label:'Dermoscopy: pigment network',type:'select',options:'Absent,Light,Dark',scope:'visit'},
  {name:'Derm_telangiectasia',label:'Dermoscopy: telangiectasia',type:'yesno',scope:'visit'},
  {name:'Patient_satisfaction',label:'Patient satisfaction (0–10)',type:'number',scope:'visit'}]},
 alopecia:{title:'Efficacy of ___ in alopecia areata',scale:'SALT',weeks:[0,4,8,12],vars:[
  {name:'Duration_months',label:'Duration of current episode (months)',type:'number',scope:'baseline'},
  {name:'Nail_pitting',label:'Nail pitting',type:'yesno',scope:'baseline'},
  {name:'Tricho_yellow_dots',label:'Trichoscopy: yellow dots',type:'yesno',scope:'visit'},
  {name:'Tricho_exclamation',label:'Trichoscopy: exclamation mark hairs',type:'yesno',scope:'visit'},
  {name:'Tricho_black_dots',label:'Trichoscopy: black dots',type:'yesno',scope:'visit'},
  {name:'Tricho_vellus',label:'Trichoscopy: short vellus / regrowing hairs',type:'yesno',scope:'visit'},
  {name:'Vit_D',label:'Serum vitamin D (ng/mL)',type:'number',scope:'baseline'},
  {name:'Ferritin',label:'Serum ferritin (ng/mL)',type:'number',scope:'baseline'}]},
 acne:{title:'Comparative study of ___ in acne vulgaris',scale:'GAGS',weeks:[0,4,8,12],vars:[
  {name:'Comedones',label:'Comedone count',type:'number',scope:'visit'},
  {name:'Papules',label:'Papule count',type:'number',scope:'visit'},
  {name:'Pustules',label:'Pustule count',type:'number',scope:'visit'},
  {name:'Nodules',label:'Nodule count',type:'number',scope:'visit'},
  {name:'PIH',label:'Post-inflammatory hyperpigmentation',type:'yesno',scope:'visit'},
  {name:'CADI',label:'CADI score',type:'number',scope:'visit'}]},
 atopic:{title:'Efficacy of ___ in atopic dermatitis',scale:'SCORAD',weeks:[0,2,4,8,12],vars:[
  {name:'EASI',label:'EASI (enter from EASI calculator)',type:'number',scope:'visit'},
  {name:'IgE',label:'Total serum IgE (IU/mL)',type:'number',scope:'baseline'},
  {name:'AEC',label:'Absolute eosinophil count',type:'number',scope:'visit'},
  {name:'Pruritus_NRS',label:'Itch NRS (0–10)',type:'number',scope:'visit'},
  {name:'Family_atopy',label:'Family history of atopy',type:'yesno',scope:'baseline'}]}
};
