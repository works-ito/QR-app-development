/**
 * QR在庫管理：送信エラーログ受信処理（独立機能）
 * 既存 doPost(e) の action 分岐の先頭に以下を追加：
 * if (data.action === "recordBatchErrors") return jsonOutput_(recordBatchErrors_(ss, data));
 * data は既存の JSON.parse(e.postData.contents) の結果を使用。
 * 既存 doPost のレスポンス形式に合わせる必要がある場合は、
 * recordBatchErrors_ の戻り値（ContentService TextOutput）をそのまま返す。
 *
 * doPost 内で取得済みの ss を引数として渡す。
 */
function recordBatchErrors_(ss, data) {
  const events = Array.isArray(data && data.events) ? data.events.slice(0, 20) : [];
  if (!events.length) return ({ok:true,acceptedIds:[]});
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return ({ok:false,message:"lock busy",acceptedIds:[]});
  try {
    const name = "送信エラーログ";
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    const headers = ["記録ID","送信ID","レコード位置","管理番号","作業区分","エラー内容","判定","端末","作業者","拠点","失敗日時","記録日時"];
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    const last = sheet.getLastRow();
    const existing = new Set(last > 1 ? sheet.getRange(2,1,last-1,1).getValues().flat().map(String) : []);
    const acceptedIds = [], rows = [];
    events.forEach(e => {
      if (!e || typeof e !== "object") return;
      const id = String(e.eventId || "").slice(0,250);
      if (!id || !String(e.sendId || "")) return;
      acceptedIds.push(id);
      if (existing.has(id)) return;
      existing.add(id);
      const safe = v => {
        const s = String(v == null ? "" : v).slice(0,3000);
        return /^[=+@\-\t\r]/.test(s) ? "'" + s : s;
      };
      rows.push([safe(id),safe(e.sendId),Number(e.recordIndex) || 0,
        safe(e.managementId),safe(e.mode),safe(e.message),safe(e.status),
        safe(e.userAgent),safe(e.user),safe(e.location),safe(e.failedAt),new Date()]);
    });
    if (rows.length) sheet.getRange(sheet.getLastRow()+1,1,rows.length,headers.length).setValues(rows);
    return ({ok:true,acceptedIds});
  } catch (error) {
    console.error("recordBatchErrors_:",error);
    return ({ok:false,message:String(error),acceptedIds:[]});
  } finally {lock.releaseLock();}
}
