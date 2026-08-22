const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const SESSION_EXPIRATION_SECONDS = 21600;
const FAMILY_CODE_PATTERN = /^[A-Z]{2}[0-9]{2}$/;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index');
}

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    switch (params.action) {
      case 'createFamily': return createFamily(params.members);
      case 'getFamilySettings': return getFamilySettings(params.familyCode);
      case 'login': return loginCheck(params.familyCode, params.username, params.password);
      case 'getEvents': return getEvents(params.sessionToken);
      case 'addEvent': return addEvent(params.sessionToken, params.date, params.username, params.plan);
      case 'updateFamilySettings': return updateFamilySettings(params.members, params.sessionToken);
      default: return jsonResponse({ status: 'fail', message: '未対応の操作です。' });
    }
  } catch (error) {
    console.error(error);
    return jsonResponse({ status: 'fail', message: error.message });
  }
}

function createFamily(members) {
  const normalizedMembers = validateNewMembers(members);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const familyCode = generateUniqueFamilyCode();
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const createdSheets = [];
    try {
      const calendarSheet = spreadsheet.insertSheet(`${familyCode}-Calendar`);
      createdSheets.push(calendarSheet);
      calendarSheet.getRange(1, 1, 1, 3).setValues([['日付', '名前', '予定']]);

      const houseworkSheet = spreadsheet.insertSheet(`${familyCode}-Housework`);
      createdSheets.push(houseworkSheet);
      houseworkSheet.getRange(1, 1, 1, 4).setValues([['日付', '名前', '家事', '状態']]);

      const passwordSheet = spreadsheet.insertSheet(`${familyCode}-Password`);
      createdSheets.push(passwordSheet);
      passwordSheet.getRange(1, 1, 1, 3).setValues([['名前', 'パスワード', '色']]);
      passwordSheet.getRange(2, 1, normalizedMembers.length, 3).setValues(
        normalizedMembers.map(member => [member.name, member.password, member.color])
      );
      return jsonResponse({ status: 'success', familyCode: familyCode });
    } catch (error) {
      createdSheets.forEach(sheet => spreadsheet.deleteSheet(sheet));
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

// 旧形式のCalendar、Housework、Passwordを家族コード形式へ一度だけ移行する
function migrateLegacyFamily() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const calendarSheet = spreadsheet.getSheetByName('Calendar');
    const passwordSheet = spreadsheet.getSheetByName('Password');
    let houseworkSheet = spreadsheet.getSheetByName('Housework');
    if (!calendarSheet || !passwordSheet) {
      throw new Error('移行対象のCalendarまたはPasswordタブが見つかりません。');
    }
    if (!houseworkSheet) {
      houseworkSheet = spreadsheet.insertSheet('Housework');
      houseworkSheet.getRange(1, 1, 1, 4).setValues([['日付', '名前', '家事', '状態']]);
    }
    const familyCode = generateUniqueFamilyCode();
    calendarSheet.setName(`${familyCode}-Calendar`);
    houseworkSheet.setName(`${familyCode}-Housework`);
    passwordSheet.setName(`${familyCode}-Password`);
    console.log(`既存家族の家族コード: ${familyCode}`);
    return familyCode;
  } finally {
    lock.releaseLock();
  }
}

function getFamilySettings(familyCode) {
  const code = normalizeFamilyCode(familyCode);
  const sheet = getFamilySheet(code, 'Password');
  const data = sheet.getDataRange().getValues();
  const members = [];
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0] || '').trim();
    if (name) members.push({ name: name, color: normalizeColor(data[i][2]) });
  }
  return jsonResponse({ status: 'success', members: members });
}

function loginCheck(familyCode, username, password) {
  const code = normalizeFamilyCode(familyCode);
  const sheet = getFamilySheet(code, 'Password');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username && String(data[i][1]) === String(password)) {
      const sessionToken = Utilities.getUuid();
      putSession(sessionToken, code, username);
      return jsonResponse({ status: 'success', sessionToken: sessionToken });
    }
  }
  return jsonResponse({ status: 'fail', message: 'パスワードが正しくありません。' });
}

function getEvents(sessionToken) {
  const session = getSession(sessionToken);
  const sheet = getFamilySheet(session.familyCode, 'Calendar');
  const data = sheet.getDataRange().getValues();
  const events = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) events.push({ date: data[i][0], name: data[i][1], plan: data[i][2] });
  }
  return jsonResponse(events);
}

function addEvent(sessionToken, date, username, plan) {
  const session = getSession(sessionToken);
  if (!date || !username || !plan) throw new Error('予定の入力内容が不足しています。');
  const memberNames = getMemberNames(session.familyCode);
  if (!memberNames.includes(username)) throw new Error('指定されたメンバーが見つかりません。');
  getFamilySheet(session.familyCode, 'Calendar').appendRow([date, username, plan]);
  return jsonResponse({ status: 'success' });
}

function updateFamilySettings(members, sessionToken) {
  const session = getSession(sessionToken);
  if (!Array.isArray(members) || members.length < 1 || members.length > 10) throw new Error('家族の人数が正しくありません。');
  const normalizedMembers = members.map(member => ({
    originalName: String(member.accountName || '').trim(),
    name: String(member.name || '').trim(),
    password: String(member.password || ''),
    color: normalizeColor(member.color)
  }));
  validateMemberNames(normalizedMembers);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const passwordSheet = getFamilySheet(session.familyCode, 'Password');
    const existingData = passwordSheet.getDataRange().getValues();
    const existingPasswords = {};
    for (let i = 1; i < existingData.length; i++) existingPasswords[String(existingData[i][0])] = String(existingData[i][1]);
    const rows = normalizedMembers.map(member => {
      const password = member.password || existingPasswords[member.originalName];
      if (!password) throw new Error(`${member.name}のパスワードを入力してください。`);
      return [member.name, password, member.color];
    });
    const oldRows = Math.max(passwordSheet.getLastRow() - 1, 0);
    if (oldRows) passwordSheet.getRange(2, 1, oldRows, 3).clearContent();
    passwordSheet.getRange(2, 1, rows.length, 3).setValues(rows);
    updateEventMemberNames(session.familyCode, normalizedMembers);
    const renamedUser = normalizedMembers.find(member => member.originalName === session.username);
    if (renamedUser) putSession(sessionToken, session.familyCode, renamedUser.name);
    return jsonResponse({ status: 'success' });
  } finally {
    lock.releaseLock();
  }
}

function updateEventMemberNames(familyCode, members) {
  const renameMap = {};
  members.forEach(member => { if (member.originalName && member.originalName !== member.name) renameMap[member.originalName] = member.name; });
  if (!Object.keys(renameMap).length) return;
  const sheet = getFamilySheet(familyCode, 'Calendar');
  if (sheet.getLastRow() < 2) return;
  const range = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1);
  const values = range.getValues();
  let changed = false;
  values.forEach(row => { if (renameMap[row[0]]) { row[0] = renameMap[row[0]]; changed = true; } });
  if (changed) range.setValues(values);
}

function generateUniqueFamilyCode() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  for (let i = 0; i < 200; i++) {
    const code = String.fromCharCode(65 + randomInt(26)) + String.fromCharCode(65 + randomInt(26)) + randomInt(10) + randomInt(10);
    if (!spreadsheet.getSheetByName(`${code}-Password`) && !spreadsheet.getSheetByName(`${code}-Calendar`) && !spreadsheet.getSheetByName(`${code}-Housework`)) return code;
  }
  throw new Error('家族コードを生成できませんでした。もう一度お試しください。');
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function validateNewMembers(members) {
  if (!Array.isArray(members) || members.length < 1 || members.length > 10) throw new Error('家族の人数が正しくありません。');
  const normalized = members.map(member => ({ name: String(member.name || '').trim(), password: String(member.password || ''), color: normalizeColor(member.color) }));
  validateMemberNames(normalized);
  if (normalized.some(member => !member.password)) throw new Error('すべてのパスワードを入力してください。');
  return normalized;
}

function validateMemberNames(members) {
  if (members.some(member => !member.name)) throw new Error('すべての名前を入力してください。');
  if (new Set(members.map(member => member.name)).size !== members.length) throw new Error('メンバー名が重複しています。');
}

function getMemberNames(familyCode) {
  return getFamilySheet(familyCode, 'Password').getDataRange().getValues().slice(1).map(row => String(row[0])).filter(Boolean);
}

function getFamilySheet(familyCode, type) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(`${familyCode}-${type}`);
  if (!sheet) throw new Error('家族グループが見つかりません。');
  return sheet;
}

function normalizeFamilyCode(familyCode) {
  const code = String(familyCode || '').trim().toUpperCase();
  if (!FAMILY_CODE_PATTERN.test(code)) throw new Error('家族コードの形式が正しくありません。');
  return code;
}

function putSession(sessionToken, familyCode, username) {
  CacheService.getScriptCache().put(`session_${sessionToken}`, JSON.stringify({ familyCode: familyCode, username: username }), SESSION_EXPIRATION_SECONDS);
}

function getSession(sessionToken) {
  if (!sessionToken) throw new Error('ログインが必要です。');
  const value = CacheService.getScriptCache().get(`session_${sessionToken}`);
  if (!value) throw new Error('ログインの有効期限が切れています。');
  return JSON.parse(value);
}

function normalizeColor(color) {
  const value = String(color || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : '#e0e0e0';
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
