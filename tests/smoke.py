# Smoke test for cdp.py: keymap loads, a key can be changed and undone, lighting tab reads values.
sleep(1.2)
print("keyboard:", ev("S.dev && S.dev.name"), "| protocol:", ev("S.protocol"))
print(ev("""(async()=>{
 const n=[...document.querySelectorAll('#board .key')].find(n=>n._key.row===0&&n._key.col===0); n.click();
 await new Promise(r=>setTimeout(r,100));
 [...document.querySelectorAll('#picker-body .kc')].find(b=>b.textContent==='A').click(); await new Promise(r=>setTimeout(r,300));
 const after=(await S.kb.readKeymap(S.layers,S.rows,S.cols))[0][0][0];
 document.querySelector('#undo').click(); await new Promise(r=>setTimeout(r,300));
 const undone=(await S.kb.readKeymap(S.layers,S.rows,S.cols))[0][0][0];
 return 'Esc->A: '+S.kc.describe(after).name+', after undo: '+S.kc.describe(undone).name})()"""))
ev("showTab('lighting')"); sleep(1.2)
print("lighting:", ev("JSON.stringify(L.values)"))
shot("smoke_lighting")
