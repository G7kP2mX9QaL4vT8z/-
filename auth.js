let selectedMember = "";
// 提供いただいたGASのURL
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

// ログイン処理（GASと通信）
async function login() {
    const passwordInput = document.getElementById('password-input').value;
    
    if (!passwordInput) {
        alert("パスワードを入力してください");
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
            alert(selectedMember + "さん、こんにちは！");
            // ログイン情報をブラウザに一時保存（どのユーザーか識別するため）
            localStorage.setItem('family_calendar_user', selectedMember);
            // カレンダー画面へ移動
            window.location.href = "calendar.html"; 
        } else {
            alert("パスワードが正しくありません。");
        }
    } catch (error) {
        console.error("エラーが発生しました:", error);
        alert("通信エラーが発生しました。GASの設定（アクセス権限が『全員』になっているか）を確認してください。");
    }
}
