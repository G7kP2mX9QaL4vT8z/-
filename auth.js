const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwzAoj-EZOHTz34hrigOI8VSi7KGye90fICRKPRpyXePtpYEg2W6SuXl03nueFbl1vOPw/exec";
const DEFAULT_COLORS = ["#f5f5f5", "#3510ff", "#ff1010", "#ffd410", "#98fb98", "#dda0dd"];
const DEFAULT_NAMES = ["父", "母", "兄", "妹"];
let selectedAccountName = "";
let selectedFamilyCode = "";

function setVisibleSection(sectionId) {
    ['start-section', 'join-code-section', 'member-section', 'password-section'].forEach(id => document.getElementById(id).classList.toggle('hidden', id !== sectionId));
}

function showStartSection() { selectedFamilyCode = ""; setVisibleSection('start-section'); }
function showJoinFamily() {
    const codeInput = document.getElementById('family-code-input');
    codeInput.value = "";
    setVisibleSection('join-code-section');
    codeInput.focus();
}
function showMemberSection() { selectedAccountName = ""; document.getElementById('password-input').value = ""; setVisibleSection('member-section'); }

async function joinFamily() {
    const familyCode = document.getElementById('family-code-input').value.trim().toUpperCase();
    if (!/^[A-Z]{2}[0-9]{2}$/.test(familyCode)) { alert("家族コードは英大文字2文字と数字2文字で入力してください。"); return; }
    try {
        const result = await postApi({ action: "getFamilySettings", familyCode });
        if (result.status !== 'success') throw new Error(result.message);
        selectedFamilyCode = familyCode;
        renderLoginMembers(result.members);
        setVisibleSection('member-section');
    } catch (error) { alert(error.message || "家族グループが見つかりませんでした。"); }
}

function renderLoginMembers(members) {
    const list = document.getElementById('login-member-list');
    list.innerHTML = "";
    members.forEach(member => {
        const button = document.createElement('button');
        button.className = 'member-button';
        button.textContent = member.name;
        button.style.backgroundColor = member.color;
        button.onclick = () => showPasswordInput(member.name);
        list.appendChild(button);
    });
}

function showPasswordInput(member) {
    selectedAccountName = member;
    document.getElementById('selected-member-name').textContent = member + "としてログイン";
    setVisibleSection('password-section');
    document.getElementById('password-input').focus();
}

async function login() {
    const password = document.getElementById('password-input').value;
    if (!password) return;
    try {
        const result = await postApi({ action: "login", familyCode: selectedFamilyCode, username: selectedAccountName, password });
        if (result.status !== 'success') throw new Error(result.message || "パスワードが正しくありません。");
        localStorage.setItem('family_calendar_user', selectedAccountName);
        localStorage.setItem('family_calendar_code', selectedFamilyCode);
        sessionStorage.setItem('family_calendar_session', result.sessionToken);
        window.location.href = "calendar.html";
    } catch (error) { alert(error.message || "ログインできませんでした。"); }
}

function openCreateFamily() {
    document.getElementById('create-family-count').value = 4;
    renderCreateFamilyRows(DEFAULT_NAMES.map((name, index) => ({ name, password: "", color: DEFAULT_COLORS[index] })));
    document.getElementById('create-family-modal').classList.remove('hidden');
}

function closeCreateFamily() { document.getElementById('create-family-modal').classList.add('hidden'); }

function changeCreateFamilyCount() {
    const input = document.getElementById('create-family-count');
    const count = Math.max(1, Math.min(10, Number(input.value) || 1));
    input.value = count;
    const members = readCreateFamilyRows();
    while (members.length < count) {
        const index = members.length;
        members.push({ name: `メンバー${index + 1}`, password: "", color: DEFAULT_COLORS[index % DEFAULT_COLORS.length] });
    }
    renderCreateFamilyRows(members.slice(0, count));
}

function renderCreateFamilyRows(members) {
    const list = document.getElementById('create-family-list');
    list.innerHTML = "";
    members.forEach(member => {
        const row = document.createElement('div');
        row.className = 'family-setting-row';
        row.innerHTML = `<input type="text" class="family-name-input" maxlength="20" value="${escapeHtml(member.name)}" aria-label="メンバー名"><div class="password-field"><input type="password" class="family-password-input" autocomplete="new-password" value="${escapeHtml(member.password)}" placeholder="パスワード" aria-label="パスワード"><button type="button" class="password-toggle" onclick="togglePasswordVisibility(this)" aria-label="パスワードを表示">&#128065;</button></div><input type="color" class="family-color-input" value="${member.color}" aria-label="メンバーの色">`;
        list.appendChild(row);
    });
}

function readCreateFamilyRows() {
    return Array.from(document.querySelectorAll('#create-family-list .family-setting-row')).map(row => ({ name: row.querySelector('.family-name-input').value.trim(), password: row.querySelector('.family-password-input').value, color: row.querySelector('.family-color-input').value }));
}

async function createFamily() {
    const members = readCreateFamilyRows();
    if (members.some(member => !member.name || !member.password)) { alert("すべての名前とパスワードを入力してください。"); return; }
    if (new Set(members.map(member => member.name)).size !== members.length) { alert("メンバー名は重複しないようにしてください。"); return; }
    try {
        const result = await postApi({ action: "createFamily", members });
        if (result.status !== 'success') throw new Error(result.message);
        closeCreateFamily();
        document.getElementById('created-family-code').textContent = result.familyCode;
        document.getElementById('family-code-modal').classList.remove('hidden');
    } catch (error) { alert(error.message || "家族グループを作成できませんでした。"); }
}

function finishFamilyCreation() { document.getElementById('family-code-modal').classList.add('hidden'); showStartSection(); }
function togglePasswordVisibility(button) { const input = button.previousElementSibling; const show = input.type === 'password'; input.type = show ? 'text' : 'password'; button.setAttribute('aria-label', show ? 'パスワードを非表示' : 'パスワードを表示'); }
function postApi(body) { return fetch(GAS_WEB_APP_URL, { method: "POST", body: JSON.stringify(body) }).then(response => response.json()); }
function escapeHtml(value) { return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]); }
