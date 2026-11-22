/**
 * WORKS 破損写真 保存試験 / GAS バックエンド
 * セットアップ: スクリプトプロパティ TEST_ROOT_FOLDER_ID に、手動で作成したテスト専用フォルダIDを指定。
 * ウェブアプリ: 実行ユーザー「自分」、アクセスは組織の限定メンバーのみ。
 * 本番利用禁止: 認証・権限・監査・運用通知は別途実装が必要。
 */
const TEST_PREFIX_ = 'WORKS_DAMAGE_TEST_';
const MAX_PHOTOS_ = 50;
const MAX_PHOTO_BYTES_ = 5 * 1024 * 1024;

/**
 * GitHub Pages からの接続確認専用。
 * テスト用フォルダや写真には触れず、通信成功の応答だけを返す。
 * 本番での写真送信には別途本人確認とアクセス制御が必要。
 */
function postReply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents || '';
    if (raw.length > 8 * 1024 * 1024) return postReply_({ok:false,error:'PAYLOAD_TOO_LARGE'});
    const data = JSON.parse(raw || '{}');
    if (data.action === 'ping') return postReply_({ok:true,action:'ping',app:'WORKS_DAMAGE_TEST'});
    if (data.action === 'start') {
      const r = startTestSession();
      return postReply_({ok:true,sessionId:r.sessionId,folderUrl:r.folderUrl,saved:r.saved});
    }
    if (data.action === 'status') {
      const r = getTestStatus(data.sessionId);
      return postReply_({ok:true,sessionId:r.sessionId,folderUrl:r.folderUrl,saved:r.saved});
    }
    if (data.action === 'upload') {
      const r = uploadTestPhoto(data.sessionId,Number(data.index),data.base64,Number(data.expectedBytes));
      return postReply_({ok:true,...r});
    }
    if (data.action === 'customers') return postReply_({ok:true,customers:customerMaster_()});
    if (data.action === 'organizedStart') return postReply_({ok:true,...startOrganized_(data.customer,data.returnDate,data.siteName)});
    if (data.action === 'organizedStatus') return postReply_({ok:true,...organizedStatus_(data.sessionId,data.token,data.siteName)});
    if (data.action === 'organizedUpload') return postReply_({ok:true,...organizedUpload_(data.sessionId,data.token,data.siteName,Number(data.index),data.base64,Number(data.expectedBytes))});
    return postReply_({ok:false,error:'UNSUPPORTED_ACTION'});
  } catch(err) {
    return postReply_({ok:false,error:String(err && err.message || err)});
  }
}
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('WORKS 写真保存テスト');
}
function testRoot_() {
  const id = PropertiesService.getScriptProperties().getProperty('TEST_ROOT_FOLDER_ID');
  if (!id) throw new Error('TEST_ROOT_FOLDER_ID が設定されていません');
  return DriveApp.getFolderById(id);
}
function testSession_(sessionId) {
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(String(sessionId))) {
    throw new Error('不正なセッションID');
  }
  const rootId = testRoot_().getId();
  const folder = DriveApp.getFolderById(sessionId);
  let owned = false;
  const parents = folder.getParents();
  while (parents.hasNext()) if (parents.next().getId() === rootId) owned = true;
  if (!owned || !folder.getName().startsWith(TEST_PREFIX_)) {
    throw new Error('このテスト用フォルダにはアクセスできません');
  }
  return folder;
}
function startTestSession() {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const name = TEST_PREFIX_ +
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss') +
      '_' + Utilities.getUuid().slice(0, 8);
    const folder = testRoot_().createFolder(name);
    return { sessionId: folder.getId(), folderUrl: folder.getUrl(), saved: [] };
  } finally { lock.releaseLock(); }
}
function photoName_(index) {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_PHOTOS_) throw new Error('写真番号が不正です');
  return index === 0 ? '000_伝票.jpg' : ('000' + index).slice(-3) + '_破損.jpg';
}
function listSaved_(folder) {
  const files = folder.getFiles();
  const saved = [];
  while (files.hasNext()) {
    const f = files.next();
    const m = f.getName().match(/^(\d{3})_(伝票|破損)\.jpg$/);
    if (m) saved.push({index: Number(m[1]), name: f.getName(), size: f.getSize()});
  }
  return saved.sort((a,b) => a.index-b.index);
}
function getTestStatus(sessionId) {
  const folder = testSession_(sessionId);
  return {sessionId, folderUrl: folder.getUrl(), saved: listSaved_(folder)};
}
function uploadTestPhoto(sessionId, index, base64, expectedBytes) {
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_PHOTO_BYTES_ * 4 / 3) + 16) {
    throw new Error('画像データが大きすぎるか不正です');
  }
  if (!Number.isInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > MAX_PHOTO_BYTES_) {
    throw new Error('画像サイズが不正です');
  }
  const filename = photoName_(index);
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length !== expectedBytes) throw new Error('画像サイズが一致しません');
  // JPEG SOI/EOI
  if (bytes.length < 4 || (bytes[0]&255)!==255 || (bytes[1]&255)!==216 ||
      (bytes[bytes.length-2]&255)!==255 || (bytes[bytes.length-1]&255)!==217) {
    throw new Error('JPEG形式の画像だけ送信できます');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const folder = testSession_(sessionId);
    const existing = folder.getFilesByName(filename);
    if (existing.hasNext()) {
      const file = existing.next();
      if (file.getSize() !== expectedBytes) throw new Error('同じ番号に異なる画像が保存済みです。管理者に確認してください');
      return {index, saved:true, alreadySaved:true, fileId:file.getId(), savedCount:listSaved_(folder).length};
    }
    const blob = Utilities.newBlob(bytes, 'image/jpeg', filename);
    const file = folder.createFile(blob);
    return {index, saved:true, alreadySaved:false, fileId:file.getId(), savedCount:listSaved_(folder).length};
  } finally { lock.releaseLock(); }
}

/** フォルダ振分テスト: TEST_ROOT_FOLDER_ID/年/月/顧客名/返却日 */
function cleanCustomer_(name) {
  const s=String(name||'').normalize('NFKC').trim();
  if (!s || s.length>80 || /[\\/<>:"|?*\x00-\x1f]/.test(s) || s==='.' || s==='..') throw Error('取引先名が不正です');
  return s;
}
function validDate_(value) {
  const s=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error('返却日が不正です');
  const d=new Date(s+'T00:00:00Z');
  if(isNaN(d.getTime())||d.toISOString().slice(0,10)!==s) throw Error('存在しない返却日です');
  return s;
}
function childFolder_(parent,name) {
  const it=parent.getFoldersByName(name);
  return it.hasNext()?it.next():parent.createFolder(name);
}
function cleanSite_(name) {
  const s=String(name||'').normalize('NFKC').trim();
  if(!s||s.length>60||/[\\/<>:"|?*\x00-\x1f]/.test(s)||s==='.'||s==='..')throw Error('現場名が不正です');
  return s;
}
function startOrganized_(customer,returnDate,siteName) {
  cleanSite_(siteName);
  const c=cleanCustomer_(customer),d=validDate_(returnDate);
  const lock=LockService.getScriptLock();lock.waitLock(25000);
  try{
    let folder=testRoot_();
    for(const segment of [d.slice(0,4),d.slice(5,7),c,d]) folder=childFolder_(folder,segment);
    let token;
    // 同じ返却日フォルダで短縮識別子が衝突しないよう確認
    for(let tries=0;tries<20;tries++){
      const candidate=Utilities.getUuid().replace(/-/g,'').slice(0,20);
      const suffix='_'+candidate.slice(0,8)+'.jpg';
      const files=folder.getFiles();
      let collision=false;
      while(files.hasNext()){
        if(files.next().getName().endsWith(suffix)){collision=true;break}
      }
      if(!collision){token=candidate;break}
    }
    if(!token)throw Error('送信識別子を確保できません');
    return {sessionId:folder.getId(),token,folderUrl:folder.getUrl(),saved:[]};
  }finally{lock.releaseLock()}
}
function organizedFolder_(sessionId) {
  if(!/^[A-Za-z0-9_-]{10,128}$/.test(String(sessionId)))throw Error('不正なフォルダID');
  const f=DriveApp.getFolderById(sessionId);
  const d=validDate_(f.getName());
  let current=f;
  for(const expected of [null,d.slice(5,7),d.slice(0,4),testRoot_().getName()]){
    const parents=current.getParents();
    if(!parents.hasNext())throw Error('対象フォルダが管理外です');
    current=parents.next();
    if(expected!==null && current.getName()!==expected)throw Error('フォルダ階層が不正です');
  }
  if(current.getId()!==testRoot_().getId())throw Error('対象フォルダが管理外です');
  return f;
}
function organizedToken_(token) {
  const t=String(token||'');
  if(!/^[a-f0-9]{20}$/.test(t))throw Error('送信識別子が不正です');
  return t;
}
function organizedName_(token,siteName,index) {
  if(!Number.isInteger(index)||index<0||index>=MAX_PHOTOS_)throw Error('写真番号が不正です');
  return cleanSite_(siteName)+'_'+('000'+index).slice(-3)+'_'+organizedToken_(token).slice(0,8)+'.jpg';
}
function organizedSaved_(folder,token,siteName) {
  const suffix='_'+organizedToken_(token).slice(0,8)+'.jpg';
  const site=cleanSite_(siteName),files=folder.getFiles(),out=[];
  while(files.hasNext()){
    const f=files.next(),name=f.getName();
    if(name.startsWith(site+'_')&&name.endsWith(suffix)){
      const number=name.slice(site.length+1,-suffix.length);
      if(/^\\d{3}$/.test(number))out.push({index:Number(number),name,size:f.getSize()});
    }
  }
  return out.sort((a,b)=>a.index-b.index);
}
function organizedStatus_(sessionId,token,siteName) {
  const f=organizedFolder_(sessionId);
  return {sessionId,token,folderUrl:f.getUrl(),saved:organizedSaved_(f,token,siteName)};
}
function organizedUpload_(sessionId,token,siteName,index,base64,expectedBytes) {
  const serverStart=Date.now();
  const filename=organizedName_(token,siteName,index);
  if(typeof base64!=='string'||base64.length>Math.ceil(MAX_PHOTO_BYTES_*4/3)+16)throw Error('画像が大きすぎます');
  if(!Number.isInteger(expectedBytes)||expectedBytes<4||expectedBytes>MAX_PHOTO_BYTES_)throw Error('画像サイズが不正です');
  const bytes=Utilities.base64Decode(base64);
  if(bytes.length!==expectedBytes)throw Error('画像サイズが一致しません');
  if((bytes[0]&255)!==255||(bytes[1]&255)!==216||(bytes[bytes.length-2]&255)!==255||(bytes[bytes.length-1]&255)!==217)throw Error('JPEG形式ではありません');
  const lock=LockService.getScriptLock();lock.waitLock(25000);
  try{
    const f=organizedFolder_(sessionId),existing=f.getFilesByName(filename);
    if(existing.hasNext()){
      const file=existing.next();
      if(file.getSize()!==expectedBytes)throw Error('同番号に異なるサイズの写真が保存されています');
      return {index,saved:true,alreadySaved:true,fileId:file.getId(),serverMs:Date.now()-serverStart};
    }
    const file=f.createFile(Utilities.newBlob(bytes,'image/jpeg',filename));
    return {index,saved:true,alreadySaved:false,fileId:file.getId(),serverMs:Date.now()-serverStart};
  }finally{lock.releaseLock()}
}

/** 既存在庫管理の取引先マスタを読み取り専用で取得する。A=正式名 B=略称 C=半角カナ */
function customerMaster_() {
  const id='1dNcTslp1MgJ5ro_58qw5YcbzR4aVN33N5DMXK_gX8ao';
  const sh=SpreadsheetApp.openById(id).getSheetByName('取引先マスタ');
  if(!sh)throw Error('取引先マスタが見つかりません');
  const rows=sh.getRange(2,1,Math.max(1,sh.getLastRow()-1),3).getDisplayValues();
  return rows.filter(r=>r[0]&&r[0].trim()).map(r=>({name:r[0].trim(),short:r[1].trim(),kana:r[2].trim()}));
}
