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

  // ── Shot type extraction from PBV tags field ───────────────────────────────
  // PBV stores shot classification in tags as keys like:
  //   "type;dink", "type;drive", "type;drop", "type;smash", "type;serve;type;FASTBALL"
  // stroke_type = "forehand" | "backhand" (stroke mechanic only, NOT shot name)
  // vertical_type = "dig" | "neutral" | "overhead" (overhead = smash)
  // is_volleyed = true → volley
  // Empty tags + high speed (>45mph) → Drive
  // Empty tags + lower speed → Drop (3rd shot context)

  const STROKES_WITH_SIDES = new Set([
    "Return","Drive","Drop","Dink","Reset","Volley",
    "Block","Speed-up","Counter","Lob","Scramble",
  ]);

  // Extract base shot name from PBV tags
  function getShotNameFromTags(tags, verticalType, isVollied, speed) {
    if (!tags || Object.keys(tags).length === 0) {
      // No tag — infer from context
      if ((verticalType || "").toLowerCase() === "overhead") return "Overhead / Smash";
      if (isVollied) return "Volley";
      if ((speed || 0) >= 45) return "Drive"; // fast untagged shot = drive
      return "Drop"; // slower untagged = drop/reset
    }

    // Find the type tag key
    const tagKey = Object.keys(tags).find(k => k.startsWith("type;"));
    if (!tagKey) return null;

    // Parse: "type;dink" → "dink", "type;serve;type;FASTBALL" → "serve"
    const parts = tagKey.split(";");
    const shotType = parts[1]?.toLowerCase();

    switch (shotType) {
      case "dink":    return "Dink";
      case "drive":   return "Drive";
      case "drop":    return "Drop";
      case "smash":   return "Overhead / Smash";
      case "serve":   return "Serve";
      case "return":  return "Return";
      case "lob":     return "Lob";
      case "atp":     return "ATP";
      case "erne":    return "Erne";
      case "reset":   return "Reset";
      case "volley":  return "Volley";
      case "speedup":
      case "speed-up":
      case "speed_up": return "Speed-up";
      case "block":   return "Block";
      case "counter": return "Counter";
      case "bert":    return "Bert";
      case "tweener": return "Tweener";
      case "scramble": return "Scramble";
      default:
        console.log("Unknown tag shot type:", shotType, "full key:", tagKey);
        return null;
    }
  }

  // ── Parse all shots from all rallies ──────────────────────────────────────
  let rawShots = [];
  try {
    const rallies = insights?.rallies || [];
    console.log(`PBV sent ${rallies.length} rallies`);
    const totalShotsInRallies = rallies.reduce((sum, r) => sum + (r.shots?.length || 0), 0);
    console.log(`Total shots across all rallies: ${totalShotsInRallies}`);

    rallies.forEach((rally, rallyIndex) => {
      const shots = rally.shots || [];
      shots.forEach((shot) => {
        const rbm = shot.resulting_ball_movement || {};
        const traj = rbm.trajectory || {};

        // Get shot name from tags
        const baseName = getShotNameFromTags(
          shot.tags,
          shot.vertical_type,
          rbm.is_volleyed,
          rbm.speed
        );
        if (!baseName) { console.log("Skipping shot — no base name"); return; }

        // Apply BH/FH from stroke_type (forehand/backhand)
        let storedName = baseName;
        if (STROKES_WITH_SIDES.has(baseName)) {
          const side = (shot.stroke_type || "").toLowerCase();
          storedName = baseName + (side === "backhand" ? " BH" : " FH");
        }

        // Quality
        const qualityRaw = shot.quality?.overall ?? 0;
        const qualityLabel = qualityRaw === 0 ? "neg" : qualityRaw < 0.6 ? "neu" : "pos";

        // Timestamp
        const timestampSec = shot.start_ms != null ? Math.round(shot.start_ms / 1000) : null;

        // Rally ender and fault
        const isRallyEnder = shot.is_final === true;
        const hasFault = shot.errors?.faults
          ? Object.values(shot.errors.faults).some(v => v === true)
          : false;

        // Positions
        const allPlayerPositions = shot.player_positions ?? null;
        const playerPos = allPlayerPositions?.[shot.player_id] ?? null;

        // Trajectory
        const shotStart = traj.start ? { zone: traj.start.zone ?? null, x: traj.start.location?.x ?? null, y: traj.start.location?.y ?? null } : null;
        const shotEnd   = traj.end   ? { zone: traj.end.zone   ?? null, x: traj.end.location?.x   ?? null, y: traj.end.location?.y   ?? null } : null;

        rawShots.push({
          rally: rallyIndex,
          playerId: shot.player_id ?? null,
          pbvType: Object.keys(shot.tags || {}).find(k => k.startsWith("type;")) || shot.vertical_type || "unknown",
          name: storedName,
          quality: qualityRaw,
          qualityLabel,
          isRallyEnder,
          timestampSec,
          hasFault,
          strokeSide: shot.stroke_type || null,
          playerPosition: playerPos,
          allPlayerPositions,
          shotStart,
          shotEnd,
          ballSpeed: rbm.speed ?? null,
        });
      });
    });
  } catch (err) {
    console.error("Error parsing insights:", err.message);
  }

  console.log(`Parsed ${rawShots.length} shots from PBV insights`);

  // ── Calculate game result from rally winners ───────────────────────────────
  // advantage_scale on the final shot of each rally shows which team won
  // Team A = players 0+1, Team B = players 2+3
  let gameResult = null;
  try {
    const rallies = insights?.rallies || [];
    let teamAWins = 0;
    let teamBWins = 0;
    rallies.forEach(rally => {
      const shots = rally.shots || [];
      const finalShot = shots.find(s => s.is_final === true);
      if (!finalShot) return;
      const adv = finalShot.advantage_scale || [];
      if (adv.length < 4) return;
      const teamA = (adv[0] + adv[1]) / 2;
      const teamB = (adv[2] + adv[3]) / 2;
      if (teamA > teamB) teamAWins++;
      else teamBWins++;
    });
    console.log(`Rally wins — Team A (P0+P1): ${teamAWins}, Team B (P2+P3): ${teamBWins}`);
    gameResult = { teamAWins, teamBWins };
  } catch (err) {
    console.error("Error calculating game result:", err.message);
  }

  // ── Find video_jobs row ───────────────────────────────────────────────────
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

  // ── Save to video_jobs with needs_review status ───────────────────────────
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
        game_result: gameResult,
        completed_at: new Date().toISOString(),
      }),
    });
    console.log("Job updated to needs_review with", rawShots.length, "shots");
  } catch (err) {
    console.error("Error updating job row:", err.message);
  }

  return res.status(200).json({ received: true, shots: rawShots.length });
}
