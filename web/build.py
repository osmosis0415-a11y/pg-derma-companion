import pathlib, re, datetime, subprocess
BUILD = datetime.datetime.now(datetime.timezone.utc).strftime('%Y.%m.%d-%H%M')
try: BUILD += '-' + subprocess.check_output(['git','rev-parse','--short','HEAD'],cwd=pathlib.Path(__file__).parent).decode().strip()
except Exception: pass
S = pathlib.Path(__file__).parent/'src'
OUT = pathlib.Path(__file__).parent.parent/'dist'; OUT.mkdir(exist_ok=True)
js = '\n'.join((S/f).read_text() for f in ['firebase-config.js','data.js','scores.js','maps.js','icons.js','core.js','errlog.js','views1.js','views2.js','batch.js','calls.js','groupcall.js','sync.js','gate.js','app.js'])
js = js.replace("if (typeof module !== 'undefined') module.exports = { SCORES, pctImprovement, isoCalc, lignoCalc, biCalc };", '')
html = (S/'shell.html').read_text().replace('/*CSS*/', (S/'style.css').read_text()).replace('/*JS*/', js).replace('__BUILD__', BUILD)
pathlib.Path(OUT/'index.html').write_text(html)
(OUT/'bundle-check.js').write_text(js)
import shutil
for f in ['manifest.webmanifest','icon.svg','icon-192.png','icon-512.png']: shutil.copy(S/f,OUT/f)
(OUT/'sw.js').write_text((S/'sw.js').read_text().replace('__BUILD__', BUILD))
print(len(html)//1024, 'KB', 'build', BUILD)
