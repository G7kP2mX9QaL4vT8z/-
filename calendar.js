const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwErNALMT0pjSzV69ZQ02sMHTp7wlLYzTgy4g9IpMvapJUcbSbaVOT1rFUrk1Tu9zwvzQ/exec";
const currentUser = localStorage.getItem('family_calendar_user');
let currentViewDate = new Date();

window.onload = function() {
    if (!currentUser) {
        window.location.href = "index.html";
        return;
    }
    renderCalendar();
};

async function renderCalendar() {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    document.getElementById('current-month-display').textContent = `${year}年${month + 1}月`;
    
    const calendarDays = document.getElementById('calendar-days');
    calendarDays.innerHTML = "";

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    const events = await fetchEvents();

    // 空白セル
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty';
        calendarDays.appendChild(emptyCell);
    }

    // 日付セル
    for (let date = 1; date <= lastDate; date++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        
        const numSpan = document.createElement('span');
        numSpan.className = 'day-number';
        numSpan.textContent = date;
        cell.appendChild(numSpan);
        
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
        
        const dayEvents = events.filter(e => {
            const eDate = new Date(e.date);
            // 日付文字列を比較するために変換
            const compareDate = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}-${String(eDate.getDate()).padStart(2, '0')}`;
            return compareDate === dateStr;
        });

        dayEvents.forEach(e => {
            const label = document.createElement('span');
            label.className = `event-label ${getMemberColorClass(e.name)}`;
            label.textContent = e.plan;
            cell.appendChild(label);
        });

        calendarDays.appendChild(cell);
    }
    
    updateUpcomingEvents(events);
}

async function fetchEvents() {
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: "POST",
            body: JSON.stringify({ action: "getEvents" })
        });
        return await response.json();
    } catch (e) { return []; }
}

function getMemberColorClass(name) {
    const map = { '母': 'color-mama', '父': 'color-papa', '兄': 'color-brother', '妹': 'color-sister' };
    return map[name] || "";
}

function changeMonth(diff) {
    if (diff === 0) currentViewDate = new Date();
    else currentViewDate.setMonth(currentViewDate.getMonth() + diff);
    renderCalendar();
}

function toggleAddModal() {
    document.getElementById('add-modal').classList.toggle('hidden');
}

async function submitEvent() {
    const date = document.getElementById('event-date').value;
    const plan = document.getElementById('event-plan').value;
    if (!date || !plan) return;

    await fetch(GAS_WEB_APP_URL, {
        method: "POST",
        body: JSON.stringify({ action: "addEvent", username: currentUser, date: date, plan: plan })
    });
    toggleAddModal();
    renderCalendar();
}

function updateUpcomingEvents(events) {
    const list = document.getElementById('upcoming-list');
    const today = new Date();
    today.setHours(0,0,0,0);

    const upcoming = events
        .filter(e => new Date(e.date) >= today)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 5);

    list.innerHTML = upcoming.length ? "" : "予定なし";
    upcoming.forEach(e => {
        const div = document.createElement('div');
        div.className = "event-item-sidebar";
        div.style.marginBottom = "8px";
        div.innerHTML = `<small>${e.date.split('T')[0].substring(5)}</small> <strong>${e.plan}</strong>`;
        list.appendChild(div);
    });
}

function logout() {
    localStorage.removeItem('family_calendar_user');
    window.location.href = "index.html";
}
