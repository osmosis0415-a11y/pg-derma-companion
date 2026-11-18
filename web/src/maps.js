/* ===== Anatomical charts (schematic SVG, viewBox 0 0 300 400) ===== */
const BODY_PATHS = `
<circle cx="150" cy="40" r="26"/>
<rect x="140" y="64" width="20" height="16" rx="4"/>
<path d="M105 78 L195 78 L205 200 L190 216 L110 216 L95 200 Z"/>
<path d="M105 82 L82 90 L62 200 L50 268 L64 271 L80 205 L101 122 Z"/>
<path d="M195 82 L218 90 L238 200 L250 268 L236 271 L220 205 L199 122 Z"/>
<ellipse cx="55" cy="284" rx="11" ry="16"/><ellipse cx="245" cy="284" rx="11" ry="16"/>
<path d="M112 214 L148 214 L146 300 L141 378 L119 378 L116 300 Z"/>
<path d="M152 214 L188 214 L184 300 L181 378 L159 378 L154 300 Z"/>
<ellipse cx="128" cy="388" rx="16" ry="8"/><ellipse cx="172" cy="388" rx="16" ry="8"/>`;
const MAPS = {
 'body-front': { label:'Body – front', svg: BODY_PATHS + `<text x="28" y="60" class="lbl">R</text><text x="264" y="60" class="lbl">L</text><text x="150" y="150" class="zl">Anterior trunk</text>` },
 'body-back': { label:'Body – back', svg: BODY_PATHS + `<text x="28" y="60" class="lbl">L</text><text x="264" y="60" class="lbl">R</text><text x="150" y="150" class="zl">Back</text><line x1="150" y1="84" x2="150" y2="205" stroke-dasharray="3 3"/>` },
 'face': { label:'Face', svg: `<ellipse cx="150" cy="200" rx="98" ry="135"/>
<path d="M62 150 Q150 40 238 150" fill="none"/>
<ellipse cx="46" cy="205" rx="12" ry="28"/><ellipse cx="254" cy="205" rx="12" ry="28"/>
<path d="M92 158 Q112 148 132 158" fill="none"/><path d="M168 158 Q188 148 208 158" fill="none"/>
<ellipse cx="112" cy="178" rx="17" ry="8"/><ellipse cx="188" cy="178" rx="17" ry="8"/>
<path d="M150 180 L140 238 Q150 246 160 238 Z"/>
<path d="M118 278 Q150 296 182 278 Q150 268 118 278 Z"/>
<text x="150" y="120" class="zl">Forehead</text><text x="90" y="230" class="zl">R malar</text><text x="210" y="230" class="zl">L malar</text><text x="150" y="318" class="zl">Chin</text>` },
 'scalp': { label:'Scalp (top view)', svg: `<circle cx="150" cy="205" r="125"/><path d="M140 78 L150 62 L160 78" fill="none"/>
<ellipse cx="22" cy="205" rx="9" ry="24"/><ellipse cx="278" cy="205" rx="9" ry="24"/>
<circle cx="150" cy="205" r="55" stroke-dasharray="4 4" fill="none"/>
<text x="150" y="120" class="zl">Frontal</text><text x="150" y="210" class="zl">Vertex</text><text x="150" y="305" class="zl">Occipital</text><text x="70" y="210" class="zl">R parietal</text><text x="230" y="210" class="zl">L parietal</text><text x="150" y="56" class="lbl">Front</text>` },
 'oral': { label:'Oral mucosa', svg: `<ellipse cx="150" cy="200" rx="130" ry="150"/><ellipse cx="150" cy="200" rx="100" ry="120" fill="none"/>
<path d="M60 130 Q150 100 240 130" fill="none" stroke-dasharray="3 3"/><path d="M60 280 Q150 310 240 280" fill="none" stroke-dasharray="3 3"/>
<ellipse cx="150" cy="235" rx="55" ry="58"/>
<text x="150" y="70" class="zl">Upper lip</text><text x="150" y="350" class="zl">Lower lip</text><text x="150" y="155" class="zl">Hard / soft palate</text><text x="150" y="240" class="zl">Tongue</text><text x="78" y="205" class="zl">R buccal</text><text x="222" y="205" class="zl">L buccal</text><text x="150" y="292" class="zl">Floor / gingiva</text>` },
 'genital': { label:'Genital (schematic)', svg: `<text x="75" y="24" class="lbl">Male</text><ellipse cx="52" cy="120" rx="26" ry="34"/><ellipse cx="98" cy="120" rx="26" ry="34"/>
<rect x="60" y="40" width="30" height="170" rx="14"/><ellipse cx="75" cy="222" rx="20" ry="24"/>
<text x="75" y="290" class="zl">Shaft · glans · scrotum</text>
<text x="225" y="24" class="lbl">Female</text><ellipse cx="225" cy="190" rx="52" ry="130"/><ellipse cx="225" cy="195" rx="24" ry="90"/><ellipse cx="225" cy="215" rx="9" ry="22"/><circle cx="225" cy="98" r="6"/>
<text x="225" y="350" class="zl">Labia majora / minora · introitus</text>` },
 'hands': { label:'Palms & soles', svg: `<text x="75" y="20" class="lbl">R palm</text><text x="225" y="20" class="lbl">L palm</text>
<rect x="45" y="95" width="62" height="75" rx="14"/><rect x="47" y="40" width="12" height="56" rx="6"/><rect x="61" y="30" width="12" height="66" rx="6"/><rect x="75" y="34" width="12" height="62" rx="6"/><rect x="89" y="46" width="12" height="50" rx="6"/><rect x="103" y="110" width="12" height="44" rx="6" transform="rotate(-35 109 132)"/>
<rect x="193" y="95" width="62" height="75" rx="14"/><rect x="241" y="40" width="12" height="56" rx="6"/><rect x="227" y="30" width="12" height="66" rx="6"/><rect x="213" y="34" width="12" height="62" rx="6"/><rect x="199" y="46" width="12" height="50" rx="6"/><rect x="185" y="110" width="12" height="44" rx="6" transform="rotate(35 191 132)"/>
<text x="75" y="205" class="lbl">R sole</text><text x="225" y="205" class="lbl">L sole</text>
<ellipse cx="75" cy="300" rx="34" ry="85"/><ellipse cx="225" cy="300" rx="34" ry="85"/>` },
 'nerves': { label:'Peripheral nerves', svg: BODY_PATHS + `
<g class="nv"><circle cx="128" cy="62" r="5"/><text x="96" y="58">Great auricular</text>
<circle cx="78" cy="168" r="5"/><text x="2" y="160">Ulnar</text>
<circle cx="62" cy="252" r="5"/><text x="2" y="244">Radial cut.</text>
<circle cx="236" cy="252" r="5"/><text x="246" y="244">Median</text>
<circle cx="117" cy="300" r="5"/><text x="56" y="300">Com. peroneal</text>
<circle cx="140" cy="372" r="5"/><text x="70" y="366">Post. tibial</text>
<circle cx="168" cy="370" r="5"/><text x="190" y="356">Sup. peroneal</text>
<circle cx="182" cy="376" r="5"/><text x="214" y="382">Sural</text></g>
<text x="28" y="60" class="lbl">R</text><text x="264" y="60" class="lbl">L</text>` }
};
const PIN_TYPES = [['lesion','Lesion','#e11d48'],['biopsy','Biopsy site','#2563eb'],['sensory','Sensory loss','#7c3aed'],['inject','Injection','#059669'],['nerve','Thickened nerve','#ea580c'],['note','Note','#64748b']];
const pinColor = t => (PIN_TYPES.find(p => p[0] === t) || PIN_TYPES[5])[2];
