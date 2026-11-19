// Test helper: answers the app's in-app dialogs (.dlg) automatically.
// window.__dlgQueue = ['1234', true, false, ...] answers in order; when empty, window.__dlgDefault is used.
// true = OK (types the required word if the dialog asks for one), false/null = Cancel, string = typed into the field.
window.__dlgQueue = []; window.__dlgDefault = true;
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('dlg')) setTimeout(() => {
  const a = window.__dlgQueue.length ? window.__dlgQueue.shift() : window.__dlgDefault;
  const inp = n.querySelector('.dlg-in'), ok = n.querySelector('[data-r="1"]'), cancel = n.querySelector('[data-r="0"]');
  if (a === false || a === null) return cancel.click();
  if (inp) { const word = (inp.placeholder.match(/^Type (\S+)$/) || [])[1]; inp.value = a === true ? (word || '') : String(a); inp.dispatchEvent(new Event('input')); }
  (ok.disabled ? cancel : ok).click();
}, 20); }).observe(document, { childList: true, subtree: true });
window.prompt = window.confirm = () => { throw new Error('native dialog used'); };
