let selectedMember = "";
let selectedAccountName = "";
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwErNALMT0pjSzV69ZQ02sMHTp7wlLYzTgy4g9IpMvapJUcbSbaVOT1rFUrk1Tu9zwvzQ/exec";
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

function renderLoginMembers() {
    const list = document.getElementById('login-member-list');
    getFamilyMembers().forEach(member => {
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
            window.location.href = "calendar.html"; 
        } else {
            alert("パスワードが正しくありません");
        }
    } catch (error) {
        console.error("エラーが発生しました:", error);
    }
}
