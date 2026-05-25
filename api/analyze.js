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
    return res.status(400).json({ error: "matchId and userId are required" });
  }

  const apiKey = process.env.PBV_API_KEY;
  const webhookUrl = process.env.PBV_WEBHOOK_URL;

  if (!apiKey || apiKey === "pending") {
    return res.status(500).json({ error: "PB Vision API key not yet configured" });
  }

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
        webhookUrl: webhookUrl || "https://getpickleintel.com/api/webhook",
        metadata: { matchId, userId },
      }),
    });

    if (!pbvResponse.ok) {
      const errText = await pbvResponse.text();
      console.error("PBV API error:", pbvResponse.status, errText);
      return res.status(502).json({ error: "PB Vision rejected the request", detail: errText });
    }

    const pbvData = await pbvResponse.json();
    const jobId = pbvData.id || pbvData.jobId || pbvData.videoId;

    // Save job to Supabase for status tracking
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/video_jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SUPABASE_KEY}`,
        "apikey": process.env.SUPABASE_KEY,
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

    return res.status(200).json({
      success: true,
      jobId,
      message: "Video submitted. Analysis takes 15–30 minutes.",
    });

  } catch (err) {
    console.error("analyze.js error:", err);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}
