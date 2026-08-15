let selectedMember = "";
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwErNALMT0pjSzV69ZQ02sMHTp7wlLYzTgy4g9IpMvapJUcbSbaVOT1rFUrk1Tu9zwvzQ/exec";

function showPasswordInput(member) {
    selectedMember = member;
    document.getElementById('selected-member-name').textContent = member + "としてログイン";
    document.getElementById('password-section').classList.remove('hidden');
    document.querySelector('.member-list').classList.add('hidden');
}

function hidePasswordInput() {
    selectedMember = "";
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
                username: selectedMember,
                password: passwordInput
            })
        });

        const result = await response.json();

        if (result.status === 'success') {
            localStorage.setItem('family_calendar_user', selectedMember);
            window.location.href = "calendar.html"; 
        } else {
            alert("パスワードが正しくありません");
        }
    } catch (error) {
        console.error("エラーが発生しました:", error);
    }
}
