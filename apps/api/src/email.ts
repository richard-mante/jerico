import type { ApiBindings } from "./database";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export async function sendEmail(
  env: ApiBindings,
  input: { to: string; subject: string; text: string; actionUrl: string; actionLabel: string },
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error("Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      text: input.text + "\n\n" + input.actionUrl,
      html: '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#15191f"><p>' +
        escapeHtml(input.text) + '</p><p><a href="' + escapeHtml(input.actionUrl) + '">' +
        escapeHtml(input.actionLabel) + '</a></p><p style="color:#777;font-size:12px">If you did not request this, you can ignore this email.</p></div>',
    }),
  });
  if (!response.ok) throw new Error("Email provider rejected the message (HTTP " + response.status + ").");
}
