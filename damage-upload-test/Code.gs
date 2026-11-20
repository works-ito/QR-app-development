/**
 * WORKS 破損写真 保存試験 / GAS バックエンド
 * セットアップ: スクリプトプロパティ TEST_ROOT_FOLDER_ID に、手動で作成したテスト専用フォルダIDを指定。
 * ウェブアプリ: 実行ユーザー「自分」、アクセスは組織の限定メンバーのみ。
 * 本番利用禁止: 認証・権限・監査・運用通知は別途実装が必要。
 */
const TEST_PREFIX_ = 'WORKS_DAMAGE_TEST_';
const MAX_PHOTOS_ = 50;
const MAX_PHOTO_BYTES_ = 5 * 1024 * 1024;

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
