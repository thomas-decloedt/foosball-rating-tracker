import { Resend } from "resend";

export interface InviteEmailData {
  email: string;
  token: string;
  inviterName: string;
  inviteUrl: string;
}

export async function sendInviteEmail(
  apiKey: string,
  data: InviteEmailData,
): Promise<void> {
  const resend = new Resend(apiKey);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited!</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🎮 You're Invited!</h1>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi there!
    </p>
    
    <p style="font-size: 16px; margin-bottom: 20px;">
      <strong>${data.inviterName}</strong> has invited you to join the Foosball Rating Tracker!
    </p>
    
    <p style="font-size: 16px; margin-bottom: 30px;">
      Click the button below to accept your invitation and create your account:
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.inviteUrl}" style="display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Accept Invitation
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <strong>Important:</strong> This invitation link will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
    </p>
    
    <p style="font-size: 12px; color: #9ca3af; margin-top: 20px; text-align: center;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${data.inviteUrl}" style="color: #667eea; word-break: break-all;">${data.inviteUrl}</a>
    </p>
  </div>
</body>
</html>
  `.trim();

  const result = await resend.emails.send({
    from: "Foosball Rating Tracker <onboarding@resend.dev>",
    to: data.email,
    subject: "You're Invited to Foosball Rating Tracker!",
    html,
  });

  if (result.error) {
    throw new Error(`Failed to send email: ${result.error.message}`);
  }
}
