const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwVa40GuGda4hVoJ97cPhGaZG2Hoz2KDvBIbZ9YYc8XahMnOC4bG8hKaEwZN07ZMRhlsg/exec";
let currentUser = localStorage.getItem('family_calendar_user');
const familyCode = localStorage.getItem('family_calendar_code');
let currentViewDate = new Date();
let selectedDateStr = ""; // 選択された日付を保持する変数
const FAMILY_SETTINGS_KEY = "family_calendar_members";
const sessionToken = sessionStorage.getItem('family_calendar_session');
const DEFAULT_MEMBERS = [
    { name: "母", accountName: "母", color: "#ffb6c1" },
    { name: "父", accountName: "父", color: "#98fb98" },
    { name: "兄", accountName: "兄", color: "#add8e6" },
    { name: "妹", accountName: "妹", color: "#fffacd" }
];
const DEFAULT_COLORS = ["#ffb6c1", "#98fb98", "#add8e6", "#fffacd", "#dda0dd", "#ffd580"];
let familyMembers = loadFamilyMembers();
const HOUSEWORK_CATEGORIES = ['食事関連', '掃除関連', 'ペット関連', 'その他'];
let houseworkTypes = {};
let houseworkAssignments = [];

window.onload = async function() {
    if (!currentUser || !familyCode || !sessionToken) {
        window.location.href = "index.html";
        return;
    }
    await syncFamilyMembers();
    renderMemberList();
    renderCalendar();
    renderTodayHousework();
};

function loadFamilyMembers() {
    try {
        const saved = JSON.parse(localStorage.getItem(`${FAMILY_SETTINGS_KEY}_${familyCode}`));
        return Array.isArray(saved) && saved.length ? saved : DEFAULT_MEMBERS.map(member => ({ ...member }));
    } catch (error) {
        return DEFAULT_MEMBERS.map(member => ({ ...member }));
    }
}

async function syncFamilyMembers() {
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: "POST",
            body: JSON.stringify({ action: "getFamilySettings", familyCode: familyCode })
        });
        const result = await response.json();
        if (!Array.isArray(result.members) || !result.members.length) return;
        familyMembers = result.members.map(member => ({
            name: member.name,
            accountName: member.name,
            color: member.color || "#e0e0e0"
        }));
        localStorage.setItem(`${FAMILY_SETTINGS_KEY}_${familyCode}`, JSON.stringify(familyMembers));
    } catch (error) {
        console.info("保存済みの家族設定を使用します。");
    }
}

function renderMemberList() {
    const list = document.getElementById('member-list');
    list.innerHTML = "";
    familyMembers.forEach(member => {
        const item = document.createElement('li');
        item.textContent = member.name;
        item.style.backgroundColor = member.color;
        list.appendChild(item);
    });
}

// カレンダーの描画
async function renderCalendar() {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    document.getElementById('current-month-display').textContent = `${year}年${month + 1}月`;
    
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = "";

    // 曜日ヘッダー
    const daysOfWeek = ['日', '月', '火', '水', '木', '金', '土'];
    daysOfWeek.forEach((day, index) => {
        const header = document.createElement('div');
        header.className = 'day-header';
        if (index === 0) header.classList.add('sun');
        if (index === 6) header.classList.add('sat');
        header.textContent = day;
        grid.appendChild(header);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    const events = await fetchEvents();

    // 1日までを空白で埋める
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty';
        grid.appendChild(emptyCell);
    }

    // 日付セルの生成
    for (let date = 1; date <= lastDate; date++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
        
        // 日付クリック時の選択処理
        cell.onclick = function() {
            // 他のセルの選択状態を解除
            document.querySelectorAll('.calendar-day').forEach(c => c.classList.remove('selected'));
            // このセルを選択状態にする
            cell.classList.add('selected');
            selectedDateStr = dateStr;
            renderSelectedDayHousework();
        };

        const numSpan = document.createElement('span');
        numSpan.className = 'day-number';
        numSpan.textContent = date;
        cell.appendChild(numSpan);
        
        const dayEvents = events.filter(e => {
            const eDate = new Date(e.date);
            const compareDate = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}-${String(eDate.getDate()).padStart(2, '0')}`;
            return compareDate === dateStr;
        });

        dayEvents.forEach(e => {
            const label = document.createElement('span');
            label.className = 'event-label';
            label.style.backgroundColor = getMemberColor(e.name);
            const text = document.createElement('span');
            text.className = 'event-label-text';
            text.textContent = e.plan;
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'event-delete-button';
            deleteButton.textContent = '×';
            deleteButton.setAttribute('aria-label', `${e.plan}を削除`);
            deleteButton.onclick = event => { event.stopPropagation(); deleteEvent(e.id, label); };
            label.append(text, deleteButton);
            cell.appendChild(label);
        });

        grid.appendChild(cell);
    }
    
    updateUpcomingEvents(events);
}

async function fetchEvents() {
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: "POST",
            body: JSON.stringify({ action: "getEvents", sessionToken: sessionToken })
        });
        return await response.json();
    } catch (e) { return []; }
}

function getMemberColor(name) {
    const member = familyMembers.find(item => item.name === name || item.accountName === name);
    return member ? member.color : "#e0e0e0";
}

async function deleteEvent(eventId, element) {
    try {
        const response = await fetch(GAS_WEB_APP_URL, { method: "POST", body: JSON.stringify({ action: "deleteEvent", sessionToken, eventId }) });
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message);
        element.remove();
        renderCalendar();
    } catch (error) { alert(error.message || "予定を削除できませんでした。"); }
}

function changeMonth(diff) {
    if (diff === 0) currentViewDate = new Date();
    else currentViewDate.setMonth(currentViewDate.getMonth() + diff);
    selectedDateStr = ""; // 月を変えたら選択をリセット
    renderCalendar();
}

// モーダルを開く（日付が選択されているかチェック）
function openAddModal() {
    if (!selectedDateStr) {
        alert("カレンダーの日付をクリックして選択してください。");
        return;
    }
    document.getElementById('event-date').value = selectedDateStr;
    const memberSelect = document.getElementById('event-member');
    memberSelect.innerHTML = "";
    familyMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member.accountName || member.name;
        option.textContent = member.name;
        option.selected = option.value === currentUser;
        memberSelect.appendChild(option);
    });
    document.getElementById('add-modal').classList.remove('hidden');
}

function closeAddModal() {
    document.getElementById('add-modal').classList.add('hidden');
    document.getElementById('event-plan').value = "";
}

async function fetchHouseworkTypes() {
    const response = await fetch(GAS_WEB_APP_URL, { method: "POST", body: JSON.stringify({ action: "getHouseworkTypes", sessionToken }) });
    const result = await response.json();
    if (result.status !== 'success') throw new Error(result.message || '家事設定を取得できませんでした。');
    houseworkTypes = result.types;
    return houseworkTypes;
}

async function openHouseworkModal() {
    if (!selectedDateStr) { alert("カレンダーの日付をクリックして選択してください。"); return; }
    try {
        await fetchHouseworkTypes();
        const typeSelect = document.getElementById('housework-type');
        typeSelect.innerHTML = "";
        HOUSEWORK_CATEGORIES.forEach(category => {
            const values = houseworkTypes[category] || [];
            if (!values.length) return;
            const group = document.createElement('optgroup');
            group.label = category;
            values.forEach(value => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                group.appendChild(option);
            });
            typeSelect.appendChild(group);
        });
        if (!typeSelect.options.length) { alert("家事設定で家事の種類を追加してください。"); return; }
        document.getElementById('housework-date').value = selectedDateStr;
        fillMemberSelect(document.getElementById('housework-member'));
        document.getElementById('housework-modal').classList.remove('hidden');
    } catch (error) { alert(error.message); }
}

function fillMemberSelect(select) {
    select.innerHTML = "";
    familyMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member.accountName || member.name;
        option.textContent = member.name;
        option.selected = option.value === currentUser;
        select.appendChild(option);
    });
}

function closeHouseworkModal() { document.getElementById('housework-modal').classList.add('hidden'); }

async function submitHousework() {
    const date = document.getElementById('housework-date').value;
    const username = document.getElementById('housework-member').value;
    const housework = document.getElementById('housework-type').value;
    if (!date || !username || !housework) return;
    try {
        const response = await fetch(GAS_WEB_APP_URL, { method: "POST", body: JSON.stringify({ action: "addHousework", sessionToken, date, username, housework }) });
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message);
        closeHouseworkModal();
        renderTodayHousework();
    } catch (error) { alert(error.message || "家事を追加できませんでした。"); }
}

async function renderTodayHousework() {
    const list = document.getElementById('today-housework-list');
    try {
        const response = await fetch(GAS_WEB_APP_URL, { method: "POST", body: JSON.stringify({ action: "getHousework", sessionToken }) });
        const result = await response.json();
        if (!Array.isArray(result)) throw new Error(result.message);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        houseworkAssignments = result;
        const items = result.filter(item => {
            const date = new Date(item.date);
            return item.name === currentUser && date >= today && date < tomorrow;
        });
        list.innerHTML = items.length ? "" : "家事なし";
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = `today-item${item.status === '完了' ? ' completed-housework' : ''}`;
            div.textContent = item.status === '完了' ? `${item.housework}（完了）` : item.housework;
            list.appendChild(div);
        });
        renderSelectedDayHousework();
    } catch (error) { list.textContent = "読み込めませんでした"; }
}

function renderSelectedDayHousework() {
    const list = document.getElementById('selected-day-housework-list');
    if (!list) return;
    const target = selectedDateStr || formatLocalDate(new Date());
    document.getElementById('selected-date-label').textContent = selectedDateStr ? target.replaceAll('-', '/') : '今日';
    const items = houseworkAssignments.filter(item => formatLocalDate(new Date(item.date)) === target);
    list.innerHTML = items.length ? "" : "家事なし";
    items.forEach(item => {
        const row = document.createElement('div');
        row.className = `assigned-housework-row${item.status === '完了' ? ' completed-housework' : ''}`;
        row.style.backgroundColor = getMemberColor(item.name);
        const text = document.createElement('span');
        text.textContent = `${item.name}：${item.housework}${item.status === '完了' ? '（完了）' : ''}`;
        row.appendChild(text);
        if (item.name === currentUser && item.status !== '完了') {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = '完了';
            button.onclick = () => completeHousework(item.id, row);
            row.appendChild(button);
        }
        list.appendChild(row);
    });
}

async function completeHousework(houseworkId, row) {
    try {
        const response = await fetch(GAS_WEB_APP_URL, { method: "POST", body: JSON.stringify({ action: "completeHousework", sessionToken, houseworkId }) });
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message);
        const item = houseworkAssignments.find(value => value.id === houseworkId);
        if (item) item.status = '完了';
        row.classList.add('completed-housework');
        const text = row.querySelector('span');
        if (text && !text.textContent.endsWith('（完了）')) text.textContent += '（完了）';
        const button = row.querySelector('button');
        if (button) button.remove();
        renderTodayHousework();
    } catch (error) { alert(error.message || "家事を完了にできませんでした。"); }
}

function formatLocalDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function openHouseworkSettings() {
    try {
        await fetchHouseworkTypes();
        renderHouseworkSettings();
        document.getElementById('housework-settings-modal').classList.remove('hidden');
    } catch (error) { alert(error.message); }
}

function closeHouseworkSettings() { document.getElementById('housework-settings-modal').classList.add('hidden'); }

function renderHouseworkSettings() {
    const container = document.getElementById('housework-settings-list');
    container.innerHTML = "";
    HOUSEWORK_CATEGORIES.forEach(category => {
        const section = document.createElement('section');
        section.className = 'housework-category';
        section.dataset.category = category;
        const title = document.createElement('h4');
        title.textContent = category;
        section.appendChild(title);
        const items = document.createElement('div');
        items.className = 'housework-type-items';
        (houseworkTypes[category] || []).forEach(value => appendHouseworkTypeRow(items, value));
        section.appendChild(items);
        const addRow = document.createElement('div');
        addRow.className = 'housework-type-add';
        addRow.innerHTML = `<input type="text" maxlength="30" placeholder="家事を入力" aria-label="${category}に追加する家事"><button type="button" onclick="addHouseworkType(this)">追加</button>`;
        section.appendChild(addRow);
        container.appendChild(section);
    });
}

function appendHouseworkTypeRow(container, value) {
    const row = document.createElement('div');
    row.className = 'housework-type-row';
    const span = document.createElement('span');
    span.textContent = value;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '削除';
    button.onclick = () => row.remove();
    row.append(span, button);
    container.appendChild(row);
}

function addHouseworkType(button) {
    const input = button.previousElementSibling;
    const value = input.value.trim();
    if (!value) return;
    const items = button.closest('.housework-category').querySelector('.housework-type-items');
    const existing = Array.from(items.querySelectorAll('span')).some(span => span.textContent === value);
    if (!existing) appendHouseworkTypeRow(items, value);
    input.value = "";
}

async function saveHouseworkSettings() {
    const types = {};
    document.querySelectorAll('.housework-category').forEach(section => {
        types[section.dataset.category] = Array.from(section.querySelectorAll('.housework-type-row span')).map(span => span.textContent);
    });
    try {
        const response = await fetch(GAS_WEB_APP_URL, { method: "POST", body: JSON.stringify({ action: "updateHouseworkTypes", sessionToken, types }) });
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message);
        houseworkTypes = types;
        closeHouseworkSettings();
    } catch (error) { alert(error.message || "家事設定を保存できませんでした。"); }
}

function openFamilySettings() {
    document.getElementById('family-count').value = familyMembers.length;
    renderFamilySettingsRows(familyMembers);
    document.getElementById('family-settings-modal').classList.remove('hidden');
}

function closeFamilySettings() {
    document.getElementById('family-settings-modal').classList.add('hidden');
}

function changeFamilyCount() {
    const input = document.getElementById('family-count');
    const count = Math.max(1, Math.min(10, Number(input.value) || 1));
    input.value = count;
    const current = readFamilySettingsRows();
    while (current.length < count) {
        const index = current.length;
        current.push({ name: `メンバー${index + 1}`, accountName: `メンバー${index + 1}`, color: DEFAULT_COLORS[index % DEFAULT_COLORS.length] });
    }
    renderFamilySettingsRows(current.slice(0, count));
}

function renderFamilySettingsRows(members) {
    const list = document.getElementById('family-settings-list');
    list.innerHTML = "";
    members.forEach(member => {
        const row = document.createElement('div');
        row.className = 'family-setting-row';
        row.dataset.accountName = member.accountName || member.name;
        row.innerHTML = `<input type="text" class="family-name-input" maxlength="20" value="${escapeHtml(member.name)}" aria-label="メンバー名"><div class="password-field"><input type="password" class="family-password-input" autocomplete="new-password" placeholder="変更しない" aria-label="${escapeHtml(member.name)}の新しいパスワード"><button type="button" class="password-toggle" onclick="togglePasswordVisibility(this)" aria-label="パスワードを表示">&#128065;</button></div><input type="color" class="family-color-input" value="${member.color}" aria-label="メンバーの色">`;
        list.appendChild(row);
    });
}

function readFamilySettingsRows() {
    return Array.from(document.querySelectorAll('.family-setting-row')).map(row => ({
        name: row.querySelector('.family-name-input').value.trim(),
        accountName: row.dataset.accountName,
        password: row.querySelector('.family-password-input').value,
        color: row.querySelector('.family-color-input').value
    }));
}

async function saveFamilySettings() {
    const members = readFamilySettingsRows();
    if (members.some(member => !member.name)) {
        alert("すべてのメンバーの名前を入力してください。");
        return;
    }
    if (new Set(members.map(member => member.name)).size !== members.length) {
        alert("メンバー名は重複しないようにしてください。");
        return;
    }
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: "POST",
            body: JSON.stringify({ action: "updateFamilySettings", members: members, sessionToken: sessionToken })
        });
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message || "保存できませんでした");

        const previousUser = currentUser;
        familyMembers = members.map(({ name, accountName, color }) => ({ name, accountName: name, color }));
        const renamedCurrentUser = members.find(member => member.accountName === previousUser);
        if (renamedCurrentUser) {
            currentUser = renamedCurrentUser.name;
            localStorage.setItem('family_calendar_user', currentUser);
        }
        localStorage.setItem(`${FAMILY_SETTINGS_KEY}_${familyCode}`, JSON.stringify(familyMembers));
        closeFamilySettings();
        renderMemberList();
        renderCalendar();
    } catch (error) {
        console.error("家族設定の保存に失敗しました:", error);
        alert("家族設定を保存できませんでした。Google Apps Scriptの更新が必要です。");
    }
}

function togglePasswordVisibility(button) {
    const input = button.previousElementSibling;
    const showPassword = input.type === 'password';
    input.type = showPassword ? 'text' : 'password';
    button.setAttribute('aria-label', showPassword ? 'パスワードを非表示' : 'パスワードを表示');
}

function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
}

async function submitEvent() {
    const date = document.getElementById('event-date').value;
    const plan = document.getElementById('event-plan').value;
    const member = document.getElementById('event-member').value;
    if (!date || !plan.trim() || !member) return;

    await fetch(GAS_WEB_APP_URL, {
        method: "POST",
        body: JSON.stringify({ action: "addEvent", sessionToken: sessionToken, username: member, date: date, plan: plan.trim() })
    });
    closeAddModal();
    renderCalendar();
}

function updateUpcomingEvents(events) {
    const list = document.getElementById('upcoming-list');
    const today = new Date();
    today.setHours(0,0,0,0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const upcoming = events.filter(e => {
        const eventDate = new Date(e.date);
        return e.name === currentUser && eventDate >= today && eventDate < tomorrow;
    });

    list.innerHTML = upcoming.length ? "" : "予定なし";
    upcoming.forEach(e => {
        const div = document.createElement('div');
        div.style.fontSize = "0.8rem";
        div.style.marginBottom = "8px";
        div.textContent = e.plan;
        list.appendChild(div);
    });
}
