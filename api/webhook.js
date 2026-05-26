// api/webhook.js
// Receives PB Vision callback when video analysis is complete.
// Saves raw PBV data to video_jobs.raw_pbv_data and sets status = 'needs_review'.
// The app polls for needs_review jobs and shows ShotCorrectionScreen.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  let payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (err) {
    console.error("Webhook parse error:", err.message);
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  console.log("Webhook received. Keys:", Object.keys(payload || {}));

  // PB Vision sends: { vid, from_url, insights, stats, cv, error, aiEngineVersion }
  const { vid, from_url, insights, error: pbvError } = payload;

  if (pbvError) {
    console.error("PBV processing error:", pbvError);
    // Find job by pbv_job_id and mark as error
    if (vid) {
      await fetch(`${supabaseUrl}/rest/v1/video_jobs?pbv_job_id=eq.${vid}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          status: "error",
          error_message: pbvError.reason || "PB Vision processing failed",
          completed_at: new Date().toISOString(),
        }),
      });
    }
    return res.status(200).json({ received: true });
  }

  if (!insights) {
    console.error("No insights in webhook payload");
    return res.status(200).json({ received: true, warning: "No insights data" });
  }

  // ── Map PBV shot data to PickleIntel format ────────────────────────────────
  // PBV shot types → PickleIntel base names
  const shotMap = {
    drive:   "Drive",
    drop:    "Drop",
    dink:    "Dink",
    volley:  "Volley",
    smash:   "Overhead / Smash",
    lob:     "Lob",
    atp:     "ATP",
    erne:    "Erne",
    reset:   "Reset",
    speedup: "Speed-up",
    speed_up:"Speed-up",
    block:   "Block",
    counter: "Counter",
    serve:   "Serve",
    return:  "Return",
  };

  // Strokes that have BH/FH split in PickleIntel
  const STROKES_WITH_SIDES = new Set([
    "Return","Drive","Drop","Dink","Reset","Volley",
    "Block","Speed-up","Counter","Lob","Scramble",
  ]);

  // Extract shots from PBV insights
  // PBV insights.rallies[] → each rally has shots[]
  // Each shot has: type, player, quality (0-1), hand (backhand/forehand)
  let rawShots = [];
  try {
    const rallies = insights?.rallies || insights?.points || [];
    rallies.forEach((rally, rallyIndex) => {
      const shots = rally.shots || rally.strokes || [];
      shots.forEach((shot) => {
        const pbvType = (shot.type || shot.shot_type || "").toLowerCase();
        const baseName = shotMap[pbvType];
        if (!baseName) return; // skip unknown types

        // Determine BH/FH
        let storedName = baseName;
        if (STROKES_WITH_SIDES.has(baseName)) {
          const hand = (shot.hand || shot.stroke_hand || "").toLowerCase();
          if (hand.includes("back")) {
            storedName = baseName + " BH";
          } else {
            storedName = baseName + " FH"; // default to FH
          }
        }

        // Quality: PBV gives 0-1 score. Map to pos/neu/neg
        const quality = shot.quality ?? shot.score ?? 0.5;

        rawShots.push({
          rally: rallyIndex,
          pbvName: pbvType,       // original PBV classification (for display)
          name: storedName,       // mapped PickleIntel name
          quality: quality,
          player: shot.player ?? shot.player_index ?? null,
        });
      });
    });
  } catch (err) {
    console.error("Error parsing insights:", err.message);
    console.log("Insights structure:", JSON.stringify(insights).slice(0, 500));
  }

  console.log(`Parsed ${rawShots.length} shots from PBV insights`);

  // ── Find the video_jobs row by pbv_job_id ──────────────────────────────────
  let jobRow = null;
  try {
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/video_jobs?pbv_job_id=eq.${encodeURIComponent(vid)}&select=id,match_id,user_id`,
      {
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey,
        },
      }
    );
    const jobs = await jobRes.json();
    jobRow = jobs?.[0];
    console.log("Found job row:", JSON.stringify(jobRow));
  } catch (err) {
    console.error("Error fetching job row:", err.message);
  }

  if (!jobRow) {
    console.error("No video_jobs row found for vid:", vid);
    // Still return 200 so PBV doesn't retry forever
    return res.status(200).json({ received: true, warning: "Job row not found" });
  }

  // ── Save raw PBV data to video_jobs and set status = needs_review ──────────
  try {
    await fetch(
      `${supabaseUrl}/rest/v1/video_jobs?id=eq.${jobRow.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          status: "needs_review",
          raw_pbv_data: rawShots,
          completed_at: new Date().toISOString(),
        }),
      }
    );
    console.log("Job updated to needs_review with", rawShots.length, "shots");
  } catch (err) {
    console.error("Error updating job row:", err.message);
  }

  return res.status(200).json({ received: true, shots: rawShots.length });
}
