// 選択されたメンバーを保持する変数
let selectedMember = "";

// メンバーを選択した時の処理
function showPasswordInput(member) {
    selectedMember = member;
    
    // 表示の切り替え
    document.getElementById('selected-member-name').textContent = member + "としてログイン";
    document.getElementById('password-section').classList.remove('hidden');
    
    // メンバー選択ボタンを隠す（任意）
    document.querySelector('.member-list').classList.add('hidden');
}

// 戻るボタンを押した時の処理
function hidePasswordInput() {
    selectedMember = "";
    document.getElementById('password-section').classList.add('hidden');
    document.querySelector('.member-list').classList.remove('hidden');
    document.getElementById('password-input').value = "";
}

// ログインボタンを押した時の処理
function login() {
    const passwordInput = document.getElementById('password-input').value;
    
    // テスト用の簡易パスワード設定（後ほどGASと連携する際に強化できます）
    const dummyPassword = "1234";

    if (passwordInput === dummyPassword) {
        alert(selectedMember + "さん、こんにちは！カレンダーへ移動します。");
        // ログイン成功時の処理（のちにカレンダー画面へ遷移）
        // window.location.href = "calendar.html"; 
    } else {
        alert("パスワードが正しくありません。");
    }
}
