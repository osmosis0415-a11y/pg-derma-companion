import pathlib, re
S = pathlib.Path(__file__).parent/'src'
OUT = pathlib.Path(__file__).parent.parent/'dist'; OUT.mkdir(exist_ok=True)
js = '\n'.join((S/f).read_text() for f in ['data.js','scores.js','maps.js','core.js','views1.js','views2.js','app.js'])
js = js.replace("if (typeof module !== 'undefined') module.exports = { SCORES, pctImprovement, isoCalc, lignoCalc, biCalc };", '')
html = (S/'shell.html').read_text().replace('/*CSS*/', (S/'style.css').read_text()).replace('/*JS*/', js)
pathlib.Path(OUT/'index.html').write_text(html)
(OUT/'bundle-check.js').write_text(js)
import shutil
for f in ['sw.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png']: shutil.copy(S/f,OUT/f)
print(len(html)//1024, 'KB')
