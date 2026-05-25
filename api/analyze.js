// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { videoUrl, matchId, userId, userEmail, partnerEmail } = req.body;

  if (!videoUrl || !videoUrl.startsWith("https://")) {
    return res.status(400).json({ error: "Invalid video URL" });
  }
  if (!matchId || !userId) {
    return res.status(400).json({
      error: "matchId and userId are required",
      received: { matchId: matchId || "missing", userId: userId || "missing" }
    });
  }

  const apiKey     = process.env.PBV_API_KEY;
  const webhookUrl = process.env.PBV_WEBHOOK_URL || "https://getpickleintel.com/api/webhook";
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!apiKey || apiKey === "pending") {
    return res.status(500).json({ error: "PB Vision API key not configured" });
  }

  // ── Step 1: Submit to PB Vision ────────────────────────────────────────────
  let pbvData;
  try {
    const pbvResponse = await fetch("https://app.pb.vision/api/partner/v1/videos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        videoUrl,
        userEmails: [userEmail, partnerEmail].filter(Boolean),
        webhookUrl,
        metadata: { matchId, userId },
      }),
    });

    const responseText = await pbvResponse.text();
    console.log("PBV response status:", pbvResponse.status);
    console.log("PBV response body:", responseText);

    if (!pbvResponse.ok) {
      return res.status(502).json({
        error: `PB Vision returned ${pbvResponse.status}`,
        detail: responseText,
      });
    }

    try {
      pbvData = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        error: "PB Vision returned non-JSON response",
        detail: responseText,
      });
    }
  } catch (err) {
    console.error("PBV fetch error:", err.message);
    return res.status(500).json({
      error: "Failed to reach PB Vision API",
      detail: err.message,
    });
  }

  // ── Step 2: Save job to Supabase ───────────────────────────────────────────
  const jobId = pbvData?.id || pbvData?.jobId || pbvData?.videoId || pbvData?.game_id;
  console.log("PBV job created:", jobId, JSON.stringify(pbvData));

  try {
    await fetch(`${supabaseUrl}/rest/v1/video_jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        match_id: matchId,
        user_id: userId,
        pbv_job_id: jobId,
        video_url: videoUrl,
        status: "processing",
        created_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    // Don't fail the whole request if Supabase logging fails
    console.error("Supabase log error:", err.message);
  }

  return res.status(200).json({
    success: true,
    jobId,
    message: "Video submitted for analysis. Results will appear in 15–30 minutes.",
  });
}
