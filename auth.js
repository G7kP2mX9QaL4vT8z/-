let selectedMember = "";
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwErNALMT0pjSzV69ZQ02sMHTp7wlLYzTgy4g9IpMvapJUcbSbaVOT1rFUrk1Tu9zwvzQ/exec";

function showPasswordInput(member) {
    selectedMember = member;
    document.getElementById('selected-member-name').textContent = member + "としてログイン";
    document.getElementById('password-section').classList.remove('hidden');
    document.querySelector('.member-list').classList.add('hidden');
    document.getElementById('login-message').textContent = ""; // メッセージをクリア
}

function hidePasswordInput() {
    selectedMember = "";
    document.getElementById('password-section').classList.add('hidden');
    document.querySelector('.member-list').classList.remove('hidden');
    document.getElementById('password-input').value = "";
    document.getElementById('login-message').textContent = "";
}

// ログイン処理
async function login() {
    const passwordInput = document.getElementById('password-input').value;
    const messageDiv = document.getElementById('login-message');
    
    if (!passwordInput) {
        messageDiv.textContent = "パスワードを入力してください";
        messageDiv.style.color = "red";
        return;
    }

    messageDiv.textContent = "認証中...";
    messageDiv.style.color = "blue";

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
            // 成功メッセージを出さず、すぐに移動
            window.location.href = "calendar.html"; 
        } else {
            messageDiv.textContent = "パスワードが正しくありません";
            messageDiv.style.color = "red";
        }
    } catch (error) {
        console.error("エラーが発生しました:", error);
        messageDiv.textContent = "通信エラーが発生しました";
        messageDiv.style.color = "red";
    }
}
