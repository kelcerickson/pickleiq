// api/webhook.js
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

  const { vid, insights, error: pbvError } = payload;

  if (pbvError) {
    console.error("PBV processing error:", pbvError);
    if (vid) {
      await fetch(`${supabaseUrl}/rest/v1/video_jobs?pbv_job_id=eq.${vid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}`, "apikey": supabaseKey, "Prefer": "return=minimal" },
        body: JSON.stringify({ status: "error", error_message: pbvError.reason || "PBV processing failed", completed_at: new Date().toISOString() }),
      });
    }
    return res.status(200).json({ received: true });
  }

  if (!insights) {
    console.error("No insights in webhook payload");
    return res.status(200).json({ received: true, warning: "No insights data" });
  }

  const STROKES_WITH_SIDES = new Set([
    "Return","Drive","Drop","Dink","Reset","Volley",
    "Block","Speed-up","Counter","Lob","Scramble",
  ]);

  const shotTypeMap = {
    drive:    "Drive",
    drop:     "Drop",
    dink:     "Dink",
    volley:   "Volley",
    reset:    "Reset",
    lob:      "Lob",
    atp:      "ATP",
    erne:     "Erne",
    speedup:  "Speed-up",
    speed_up: "Speed-up",
    serve:    "Serve",
    return:   "Return",
    block:    "Block",
    counter:  "Counter",
    scramble: "Scramble",
    bert:     "Bert",
    tweener:  "Tweener",
  };

  let rawShots = [];
  try {
    const rallies = insights?.rallies || [];
    console.log(`PBV sent ${rallies.length} rallies`);
    if (rallies.length > 0) {
      const totalShotsInRallies = rallies.reduce((sum, r) => sum + (r.shots?.length || 0), 0);
      console.log(`Total shots across all rallies: ${totalShotsInRallies}`);
      console.log(`First rally shot count: ${rallies[0]?.shots?.length || 0}`);
    }
    rallies.forEach((rally, rallyIndex) => {
      const shots = rally.shots || [];
      shots.forEach((shot) => {
        // Determine shot type
        // PBV schema: stroke_type = "forehand"/"backhand" (stroke mechanic, NOT shot name)
        // Shot name may be in: tags, shot_type, type, or derived from vertical_type
        let pbvType = (shot.stroke_type || "").toLowerCase();
        if ((shot.vertical_type || "").toLowerCase() === "overhead") pbvType = "overhead";

        // Log the full shot fields on first few shots to identify correct field name
        if (rawShots.length < 3) {
          console.log("SHOT FIELDS:", JSON.stringify(Object.keys(shot)));
          console.log("SHOT SAMPLE:", JSON.stringify({
            stroke_type: shot.stroke_type,
            vertical_type: shot.vertical_type,
            shot_type: shot.shot_type,
            type: shot.type,
            tags: shot.tags,
            shot_class: shot.shot_class,
            classification: shot.classification,
            label: shot.label,
          }));
        }
        const baseName = pbvType === "overhead" ? "Overhead / Smash" : (shotTypeMap[pbvType] || null);
        if (!baseName) { console.log("Unknown shot type:", pbvType); return; }

        // BH/FH split
        let storedName = baseName;
        if (STROKES_WITH_SIDES.has(baseName)) {
          const side = (shot.stroke_side || "").toLowerCase();
          storedName = baseName + (side === "backhand" ? " BH" : " FH");
        }

        // Quality mapping — CONFIRMED from data:
        // 0 exactly = error/fault (ball hit net, out, etc.)
        // 0.01–0.59  = neutral (below average execution)
        // 0.60–1.0   = positive (good execution)
        const qualityRaw = shot.quality?.overall ?? 0;
        const qualityLabel = qualityRaw === 0 ? "neg" : qualityRaw < 0.6 ? "neu" : "pos";

        // Timestamp
        const timestampMs = shot.start_ms ?? null;
        const timestampSec = timestampMs !== null ? Math.round(timestampMs / 1000) : null;

        // Rally ender and fault
        const isRallyEnder = shot.is_final === true;
        const hasFault = shot.errors?.faults
          ? Object.values(shot.errors.faults).some(v => v === true)
          : false;

        // All 4 player positions at moment of shot (for click-to-identify UI)
        // PBV sends player_positions as array of {x,y} for all 4 players
        const allPlayerPositions = shot.player_positions ?? null;
        const playerPos = allPlayerPositions?.[shot.player_id] ?? null;

        // Ball trajectory
        const traj = shot.resulting_ball_movement?.trajectory ?? null;
        const shotStart = traj?.start ? {
          zone: traj.start.zone ?? null,
          x: traj.start.location?.x ?? null,
          y: traj.start.location?.y ?? null,
        } : null;
        const shotEnd = traj?.end ? {
          zone: traj.end.zone ?? null,
          x: traj.end.location?.x ?? null,
          y: traj.end.location?.y ?? null,
        } : null;

        // Ball speed mph
        const ballSpeed = shot.resulting_ball_movement?.speed ?? null;

        rawShots.push({
          rally: rallyIndex,
          playerId: shot.player_id ?? null,
          pbvType: pbvType,
          name: storedName,
          quality: qualityRaw,
          qualityLabel: qualityLabel,
          isRallyEnder: isRallyEnder,
          timestampSec: timestampSec,
          hasFault: hasFault,
          strokeSide: shot.stroke_side || null,
          playerPosition: playerPos,
          allPlayerPositions: allPlayerPositions, // all 4 positions for click-to-identify
          shotStart: shotStart,
          shotEnd: shotEnd,
          ballSpeed: ballSpeed,
        });
      });
    });
  } catch (err) {
    console.error("Error parsing insights:", err.message);
  }

  console.log(`Parsed ${rawShots.length} shots from PBV insights`);

  // Find video_jobs row
  let jobRow = null;
  try {
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/video_jobs?pbv_job_id=eq.${encodeURIComponent(vid)}&select=id,match_id,user_id`,
      { headers: { "Authorization": `Bearer ${supabaseKey}`, "apikey": supabaseKey } }
    );
    const jobs = await jobRes.json();
    jobRow = jobs?.[0];
    console.log("Found job row:", JSON.stringify(jobRow));
  } catch (err) {
    console.error("Error fetching job row:", err.message);
  }

  if (!jobRow) {
    console.error("No video_jobs row found for vid:", vid);
    return res.status(200).json({ received: true, warning: "Job row not found" });
  }

  // Save to video_jobs with needs_review status
  try {
    await fetch(`${supabaseUrl}/rest/v1/video_jobs?id=eq.${jobRow.id}`, {
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
    });
    console.log("Job updated to needs_review with", rawShots.length, "shots");
  } catch (err) {
    console.error("Error updating job row:", err.message);
  }

  return res.status(200).json({ received: true, shots: rawShots.length });
}
