// 寄信：用 Resend（https://resend.com）的 API 寄註冊驗證碼
// 主機的 /etc/yourwowai.env 填 RESEND_API_KEY 才會啟用；沒填時註冊不需要驗證 Email

export function createResendMailer({ apiKey, from, fetch = globalThis.fetch }) {
  return async function send({ to, subject, text, html }) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  };
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// 驗證碼信件內容（依 App 的語言）；purpose：signup 註冊、reset 重設密碼
export function verificationEmail(code, lang, purpose = 'signup') {
  const en = lang === 'en';
  const reset = purpose === 'reset';
  const subject = reset
    ? (en ? `Reset your YourWowAI password: ${code}` : `YourWowAI 重設密碼驗證碼：${code}`)
    : (en ? `Your YourWowAI code: ${code}` : `YourWowAI 驗證碼：${code}`);
  const lines = reset
    ? (en
      ? ['Enter this code to set a new YourWowAI password:', code, "It expires in 10 minutes. If you didn't ask to reset your password, you can ignore this email; your password stays the same."]
      : ['請輸入這組驗證碼，設定新的 YourWowAI 密碼：', code, '驗證碼 10 分鐘內有效。如果不是你本人要重設密碼，請忽略這封信，你的密碼不會改變。'])
    : (en
      ? ['Enter this code to finish signing up for YourWowAI:', code, 'It expires in 10 minutes. If you didn\'t sign up, you can ignore this email.']
      : ['請輸入這組驗證碼完成 YourWowAI 註冊：', code, '驗證碼 10 分鐘內有效。如果不是你本人註冊，請忽略這封信。']);
  const text = lines.join('\n\n');
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;color:#222;line-height:1.6">
<p>${escapeHtml(lines[0])}</p>
<p style="font-size:32px;font-weight:800;letter-spacing:6px;font-family:Menlo,Consolas,monospace;margin:20px 0">${code}</p>
<p style="color:#666">${escapeHtml(lines[2])}</p>
</div>`;
  return { subject, text, html };
}
