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
      case 'deleteEvent': return deleteEvent(params.sessionToken, params.eventId);
      case 'getHousework': return getHousework(params.sessionToken);
      case 'addHousework': return addHousework(params.sessionToken, params.date, params.username, params.housework);
      case 'completeHousework': return completeHousework(params.sessionToken, params.houseworkId);
      case 'getHouseworkTypes': return getHouseworkTypes(params.sessionToken);
      case 'updateHouseworkTypes': return updateHouseworkTypes(params.sessionToken, params.types);
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
      calendarSheet.getRange(1, 1, 1, 4).setValues([['日付', '名前', '予定', 'ID']]);

      const houseworkSheet = spreadsheet.insertSheet(`${familyCode}-Housework`);
      createdSheets.push(houseworkSheet);
      houseworkSheet.getRange(1, 1, 1, 5).setValues([['日付', '名前', '家事', '状態', 'ID']]);

      const passwordSheet = spreadsheet.insertSheet(`${familyCode}-Password`);
      createdSheets.push(passwordSheet);
      passwordSheet.getRange(1, 1, 1, 3).setValues([['名前', 'パスワード', '色']]);
      passwordSheet.getRange(2, 1, normalizedMembers.length, 3).setValues(
        normalizedMembers.map(member => [member.name, member.password, member.color])
      );
      const typesSheet = spreadsheet.insertSheet(`${familyCode}-Types of Housework`);
      createdSheets.push(typesSheet);
      typesSheet.getRange(1, 1, 1, 2).setValues([['分類', '家事']]);
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
      houseworkSheet.getRange(1, 1, 1, 5).setValues([['日付', '名前', '家事', '状態', 'ID']]);
    }
    const familyCode = generateUniqueFamilyCode();
    calendarSheet.setName(`${familyCode}-Calendar`);
    houseworkSheet.setName(`${familyCode}-Housework`);
    passwordSheet.setName(`${familyCode}-Password`);
    const typesSheet = spreadsheet.insertSheet(`${familyCode}-Types of Housework`);
    typesSheet.getRange(1, 1, 1, 2).setValues([['分類', '家事']]);
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
  ensureRecordIds(sheet, 4, 'ID');
  const data = sheet.getDataRange().getValues();
  const events = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) events.push({ date: data[i][0], name: data[i][1], plan: data[i][2], id: data[i][3] });
  }
  return jsonResponse(events);
}

function addEvent(sessionToken, date, username, plan) {
  const session = getSession(sessionToken);
  if (!date || !username || !plan) throw new Error('予定の入力内容が不足しています。');
  const memberNames = getMemberNames(session.familyCode);
  if (!memberNames.includes(username)) throw new Error('指定されたメンバーが見つかりません。');
  getFamilySheet(session.familyCode, 'Calendar').appendRow([date, username, plan, Utilities.getUuid()]);
  return jsonResponse({ status: 'success' });
}

function deleteEvent(sessionToken, eventId) {
  const session = getSession(sessionToken);
  const sheet = getFamilySheet(session.familyCode, 'Calendar');
  const row = findRowById(sheet, 4, eventId);
  if (!row) throw new Error('削除する予定が見つかりません。');
  sheet.deleteRow(row);
  return jsonResponse({ status: 'success' });
}

function getHousework(sessionToken) {
  const session = getSession(sessionToken);
  const sheet = getFamilySheet(session.familyCode, 'Housework');
  ensureRecordIds(sheet, 5, 'ID');
  const data = sheet.getDataRange().getValues();
  const housework = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) housework.push({ date: data[i][0], name: data[i][1], housework: data[i][2], status: data[i][3], id: data[i][4] });
  }
  return jsonResponse(housework);
}

function addHousework(sessionToken, date, username, housework) {
  const session = getSession(sessionToken);
  if (!date || !username || !housework) throw new Error('家事の入力内容が不足しています。');
  if (!getMemberNames(session.familyCode).includes(username)) throw new Error('指定されたメンバーが見つかりません。');
  const allTypes = Object.values(readHouseworkTypes(session.familyCode)).flat();
  if (!allTypes.includes(housework)) throw new Error('指定された家事が見つかりません。');
  getFamilySheet(session.familyCode, 'Housework').appendRow([date, username, housework, '未完了', Utilities.getUuid()]);
  return jsonResponse({ status: 'success' });
}

function completeHousework(sessionToken, houseworkId) {
  const session = getSession(sessionToken);
  const sheet = getFamilySheet(session.familyCode, 'Housework');
  const row = findRowById(sheet, 5, houseworkId);
  if (!row) throw new Error('対象の家事が見つかりません。');
  if (String(sheet.getRange(row, 2).getValue()) !== session.username) throw new Error('自分に割り当てられた家事だけ完了できます。');
  sheet.getRange(row, 4).setValue('完了');
  return jsonResponse({ status: 'success' });
}

function ensureRecordIds(sheet, idColumn, header) {
  sheet.getRange(1, idColumn).setValue(header);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const range = sheet.getRange(2, idColumn, lastRow - 1, 1);
  const values = range.getValues();
  let changed = false;
  values.forEach(row => {
    if (!row[0]) { row[0] = Utilities.getUuid(); changed = true; }
  });
  if (changed) range.setValues(values);
}

function findRowById(sheet, idColumn, id) {
  if (!id) return 0;
  ensureRecordIds(sheet, idColumn, 'ID');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, idColumn, lastRow - 1, 1).getValues();
  const index = values.findIndex(row => String(row[0]) === String(id));
  return index < 0 ? 0 : index + 2;
}

function getHouseworkTypes(sessionToken) {
  const session = getSession(sessionToken);
  return jsonResponse({ status: 'success', types: readHouseworkTypes(session.familyCode) });
}

function updateHouseworkTypes(sessionToken, types) {
  const session = getSession(sessionToken);
  const categories = ['食事関連', '掃除関連', 'ペット関連', 'その他'];
  const rows = [];
  categories.forEach(category => {
    const values = Array.isArray(types && types[category]) ? types[category] : [];
    const uniqueValues = [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
    uniqueValues.forEach(value => rows.push([category, value]));
  });
  const sheet = getOrCreateHouseworkTypesSheet(session.familyCode);
  const oldRows = Math.max(sheet.getLastRow() - 1, 0);
  if (oldRows) sheet.getRange(2, 1, oldRows, 2).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  return jsonResponse({ status: 'success' });
}

function readHouseworkTypes(familyCode) {
  const result = { '食事関連': [], '掃除関連': [], 'ペット関連': [], 'その他': [] };
  const data = getOrCreateHouseworkTypesSheet(familyCode).getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const category = String(data[i][0] || '');
    const value = String(data[i][1] || '').trim();
    if (result[category] && value) result[category].push(value);
  }
  return result;
}

function getOrCreateHouseworkTypesSheet(familyCode) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const name = `${familyCode}-Types of Housework`;
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.getRange(1, 1, 1, 2).setValues([['分類', '家事']]);
  }
  return sheet;
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
