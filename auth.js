let selectedMember = "";
let selectedAccountName = "";
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyoMW1j4vpZMozamkiFIb2QF-MuhOOVrEyNGR6P-LcD3zY--EvFF7rz4YkjCGtPa0XOEA/exec";
const FAMILY_SETTINGS_KEY = "family_calendar_members";
const DEFAULT_MEMBERS = [
    { name: "母", accountName: "母", color: "#ffb6c1" },
    { name: "父", accountName: "父", color: "#98fb98" },
    { name: "兄", accountName: "兄", color: "#add8e6" },
    { name: "妹", accountName: "妹", color: "#fffacd" }
];

window.addEventListener('DOMContentLoaded', renderLoginMembers);

function getFamilyMembers() {
    try {
        const saved = JSON.parse(localStorage.getItem(FAMILY_SETTINGS_KEY));
        return Array.isArray(saved) && saved.length ? saved : DEFAULT_MEMBERS;
    } catch (error) {
        return DEFAULT_MEMBERS;
    }
}

async function renderLoginMembers() {
    const list = document.getElementById('login-member-list');
    let members = getFamilyMembers();
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: "POST",
            body: JSON.stringify({ action: "getFamilySettings" })
        });
        const result = await response.json();
        if (Array.isArray(result.members) && result.members.length) {
            members = result.members.map(member => ({ name: member.name, accountName: member.name, color: member.color || "#e0e0e0" }));
            localStorage.setItem(FAMILY_SETTINGS_KEY, JSON.stringify(members));
        }
    } catch (error) {
        console.info("保存済みの家族設定を使用します。");
    }
    members.forEach(member => {
        const button = document.createElement('button');
        button.className = 'member-button';
        button.textContent = member.name;
        button.style.backgroundColor = member.color;
        button.onclick = () => showPasswordInput(member.name, member.accountName || member.name);
        list.appendChild(button);
    });
}

function showPasswordInput(member, accountName = member) {
    selectedMember = member;
    selectedAccountName = accountName;
    document.getElementById('selected-member-name').textContent = member + "としてログイン";
    document.getElementById('password-section').classList.remove('hidden');
    document.querySelector('.member-list').classList.add('hidden');
}

function hidePasswordInput() {
    selectedMember = "";
    selectedAccountName = "";
    document.getElementById('password-section').classList.add('hidden');
    document.querySelector('.member-list').classList.remove('hidden');
    document.getElementById('password-input').value = "";
}

// ログイン処理
async function login() {
    const passwordInput = document.getElementById('password-input').value;
    
    if (!passwordInput) {
        return;
    }

    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "login",
                username: selectedAccountName,
                password: passwordInput
            })
        });

        const result = await response.json();

        if (result.status === 'success') {
            localStorage.setItem('family_calendar_user', selectedAccountName);
            sessionStorage.setItem('family_calendar_session', result.sessionToken || '');
            window.location.href = "calendar.html"; 
        } else {
            alert("パスワードが正しくありません");
        }
    } catch (error) {
        console.error("エラーが発生しました:", error);
    }
}
