// api/register-webhook.js
// ONE-TIME SETUP ENDPOINT — call this ONCE to tell PB Vision where to send results
// After calling it once, you never need to call it again.
// Call it by visiting: https://getpickleintel.com/api/register-webhook
// (GET request — just open it in your browser)

export default async function handler(req, res) {
  const apiKey     = process.env.PBV_API_KEY;
  const webhookUrl = "https://getpickleintel.com/api/webhook";

  if (!apiKey) {
    return res.status(500).json({ error: "PBV_API_KEY not set" });
  }

  try {
    const response = await fetch("https://api-2o2klzx4pa-uc.a.run.app/partner/webhook/set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ url: webhookUrl }),
    });

    const text = await response.text();
    console.log("Webhook registration status:", response.status);
    console.log("Webhook registration response:", text);

    if (!response.ok) {
      return res.status(502).json({
        error: `PB Vision returned ${response.status}`,
        detail: text,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Webhook registered: ${webhookUrl}`,
      pbvResponse: text,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to register webhook",
      detail: err.message,
    });
  }
}
