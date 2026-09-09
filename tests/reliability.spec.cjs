const {test,expect}=require('@playwright/test');
test('offline boot, fresh game, save round trip and storage failures',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/');
 await page.waitForFunction(()=>typeof startGame==='function'&&typeof THREE!=='undefined');
 await expect(page.locator('#ovTitle')).toHaveText('ジョークラ');
 await page.evaluate(async()=>{settings.gameMode='creative';await startGame();gs.paused=true;});
 await page.evaluate(async()=>{inv.diamond=17;await saveGame();});
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem(saveKeyForSlot(1))).inv.diamond)).toBe(17);
 await page.reload();await page.waitForFunction(()=>typeof continueGame==='function');
 await page.evaluate(async()=>{await continueGame();gs.paused=true;});
 expect(await page.evaluate(()=>inv.diamond)).toBe(17);
 // Keep the write pending: no success notification until it completes.
 expect(await page.evaluate(async()=>{
  const original=window.storage.set;let finish;
  window.storage.set=()=>new Promise(resolve=>{finish=resolve;});
  showSaveToast('WAIT');const pending=saveGame({auto:true});
  while(!finish)await new Promise(resolve=>setTimeout(resolve,0));
  const before=$saveToast.textContent;finish(true);await pending;window.storage.set=original;
  return [before,$saveToast.textContent];
 })).toEqual(['WAIT','💾 AUTO-SAVED']);
 expect(await page.evaluate(async()=>{
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};
  const ok=await saveGame({auto:true});Storage.prototype.setItem=original;
  return [ok,$saveToast.textContent];
 })).toEqual([false,expect.stringContaining('保存容量が不足')]);
 page.once('dialog',d=>d.accept('new name'));
 await page.evaluate(async()=>{window.storage.set=async()=>false;await renameSaveSlot(1,await loadSaveData(1));});
 await expect(page.locator('#saveToast')).toContainText('名前変更失敗');
 expect(await page.evaluate(async()=>{
  const original=Storage.prototype.removeItem;Storage.prototype.removeItem=function(){throw new Error('denied');};
  const ok=await deleteSave(1);Storage.prototype.removeItem=original;
  return [ok,!!localStorage.getItem(saveKeyForSlot(1)),$saveToast.textContent];
 })).toEqual([false,true,expect.stringContaining('削除失敗')]);
 expect(errors).toEqual([]);
});
test('held keys do not repeat discrete actions, movement stays held',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>typeof cycleWeapon==='function');
 expect(await page.evaluate(()=>{
  let count=0;cycleWeapon=()=>count++;gs.paused=false;
  document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'}));
  document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',repeat:true}));
  document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',repeat:true}));
  const held=keys.KeyW;document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));
  return [count,held,keys.KeyW];
 })).toEqual([1,true,false]);
});
