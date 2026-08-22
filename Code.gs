const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const PASSWORD_SHEET_NAME = 'Password';
const CALENDAR_SHEET_NAME = 'Calendar';
const SESSION_EXPIRATION_SECONDS = 21600;

// ウェブアプリにアクセスがあった時の処理
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index');
}

// パスワード照合とデータ取得・保存を行う関数
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;

    if (action === 'login') {
      return loginCheck(params.username, params.password);
    } else if (action === 'getEvents') {
      return getEvents();
    } else if (action === 'addEvent') {
      return addEvent(params.date, params.username, params.plan);
    } else if (action === 'getFamilySettings') {
      return getFamilySettings();
    } else if (action === 'updateFamilySettings') {
      return updateFamilySettings(params.members, params.sessionToken);
    }

    return jsonResponse({ status: 'fail', message: '未対応の操作です。' });
  } catch (error) {
    console.error(error);
    return jsonResponse({ status: 'fail', message: error.message });
  }
}

// ログインチェック
function loginCheck(username, password) {
  const sheet = getRequiredSheet(PASSWORD_SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username && data[i][1].toString() === password.toString()) {
      const sessionToken = Utilities.getUuid();
      CacheService.getScriptCache().put(
        `session_${sessionToken}`,
        username,
        SESSION_EXPIRATION_SECONDS
      );
      return jsonResponse({ status: 'success', sessionToken: sessionToken });
    }
  }
  return jsonResponse({ status: 'fail' });
}

// 予定の取得
function getEvents() {
  const sheet = getRequiredSheet(CALENDAR_SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const events = [];

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    events.push({
      date: data[i][0],
      name: data[i][1],
      plan: data[i][2]
    });
  }
  return jsonResponse(events);
}

// 予定の追加
function addEvent(date, username, plan) {
  if (!date || !username || !plan) {
    return jsonResponse({ status: 'fail', message: '予定の入力内容が不足しています。' });
  }

  const sheet = getRequiredSheet(CALENDAR_SHEET_NAME);
  sheet.appendRow([date, username, plan]);
  return jsonResponse({ status: 'success' });
}

// Passwordタブから名前と色を取得する（パスワードは返さない）
function getFamilySettings() {
  const sheet = getRequiredSheet(PASSWORD_SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const members = [];

  for (let i = 1; i < data.length; i++) {
    const name = data[i][0].toString().trim();
    if (!name) continue;
    members.push({
      name: name,
      color: normalizeColor(data[i][2])
    });
  }

  return jsonResponse({ status: 'success', members: members });
}

// Passwordタブの名前・パスワード・色を更新する
function updateFamilySettings(members, sessionToken) {
  const currentUser = getSessionUser(sessionToken);
  if (!currentUser) {
    return jsonResponse({ status: 'fail', message: 'ログインの有効期限が切れています。' });
  }
  if (!Array.isArray(members) || members.length < 1 || members.length > 10) {
    return jsonResponse({ status: 'fail', message: '家族の人数が正しくありません。' });
  }

  const normalizedMembers = members.map(member => ({
    originalName: String(member.accountName || '').trim(),
    name: String(member.name || '').trim(),
    password: String(member.password || ''),
    color: normalizeColor(member.color)
  }));

  if (normalizedMembers.some(member => !member.name)) {
    return jsonResponse({ status: 'fail', message: 'すべての名前を入力してください。' });
  }
  if (new Set(normalizedMembers.map(member => member.name)).size !== normalizedMembers.length) {
    return jsonResponse({ status: 'fail', message: 'メンバー名が重複しています。' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const passwordSheet = getRequiredSheet(PASSWORD_SHEET_NAME);
    const existingData = passwordSheet.getDataRange().getValues();
    const existingPasswords = {};
    for (let i = 1; i < existingData.length; i++) {
      const name = existingData[i][0].toString().trim();
      if (name) existingPasswords[name] = existingData[i][1].toString();
    }

    const rows = normalizedMembers.map(member => {
      const password = member.password || existingPasswords[member.originalName];
      if (!password) throw new Error(`${member.name}のパスワードを入力してください。`);
      return [member.name, password, member.color];
    });

    passwordSheet.getRange(1, 1, 1, 3).setValues([['名前', 'パスワード', '色']]);
    const oldRowCount = Math.max(passwordSheet.getLastRow() - 1, 0);
    if (oldRowCount > 0) passwordSheet.getRange(2, 1, oldRowCount, 3).clearContent();
    passwordSheet.getRange(2, 1, rows.length, 3).setValues(rows);

    updateEventMemberNames(normalizedMembers);

    const renamedCurrentUser = normalizedMembers.find(member => member.originalName === currentUser);
    if (renamedCurrentUser) {
      CacheService.getScriptCache().put(
        `session_${sessionToken}`,
        renamedCurrentUser.name,
        SESSION_EXPIRATION_SECONDS
      );
    }

    return jsonResponse({ status: 'success' });
  } finally {
    lock.releaseLock();
  }
}

// 名前変更時に既存予定のメンバー名も更新する
function updateEventMemberNames(members) {
  const renameMap = {};
  members.forEach(member => {
    if (member.originalName && member.originalName !== member.name) {
      renameMap[member.originalName] = member.name;
    }
  });
  if (Object.keys(renameMap).length === 0) return;

  const sheet = getRequiredSheet(CALENDAR_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const range = sheet.getRange(2, 2, lastRow - 1, 1);
  const values = range.getValues();
  let changed = false;
  values.forEach(row => {
    if (renameMap[row[0]]) {
      row[0] = renameMap[row[0]];
      changed = true;
    }
  });
  if (changed) range.setValues(values);
}

function getSessionUser(sessionToken) {
  if (!sessionToken) return null;
  return CacheService.getScriptCache().get(`session_${sessionToken}`);
}

function getRequiredSheet(sheetName) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  if (!sheet) throw new Error(`${sheetName}タブが見つかりません。`);
  return sheet;
}

function normalizeColor(color) {
  const value = String(color || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : '#e0e0e0';
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
