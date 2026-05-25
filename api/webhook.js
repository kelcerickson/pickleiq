// api/webhook.js
// Receives PB Vision's callback when video analysis completes.
// Maps PB Vision shot data to PickleIntel's schema and saves to Supabase.
//
// PB Vision POSTs here with the full insights payload.
// Schema reference: https://pbv-public.github.io/insights

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  try {
    const payload = req.body;

    // PB Vision sends metadata we attached at submission time
    const matchId = payload.metadata?.matchId;
    const userId  = payload.metadata?.userId;

    if (!matchId || !userId) {
      console.error("Webhook missing matchId or userId in metadata", payload.metadata);
      return res.status(400).json({ error: "Missing metadata" });
    }

    // ── Extract player data ──────────────────────────────────────────────────
    // PB Vision returns up to 4 players (indices 0-3 for doubles)
    // We match the submitting user by userId stored in metadata
    const players = payload.player_data || [];

    // For now we take index 0 as the primary player.
    // TODO: once PB Vision confirms userEmail matching, use email to find the right index.
    const myPlayer = players[0] || {};
    const stats    = myPlayer.stats || {};

    // ── Map PB Vision shot taxonomy to PickleIntel shot names ───────────────
    // PB Vision: shot_type + stroke_side → PickleIntel: "Drive FH", "Dink BH" etc.
    const shotMap = {
      "drive-forehand":    "Drive FH",
      "drive-backhand":    "Drive BH",
      "drop-forehand":     "Drop FH",
      "drop-backhand":     "Drop BH",
      "dink-forehand":     "Dink FH",
      "dink-backhand":     "Dink BH",
      "smash-forehand":    "Slam FH",
      "smash-backhand":    "Slam BH",
      "lob-forehand":      "Lob FH",
      "lob-backhand":      "Lob BH",
      "atp-forehand":      "ATP FH",
      "atp-backhand":      "ATP BH",
      "erne-forehand":     "Erne FH",
      "erne-backhand":     "Erne BH",
    };

    // Accumulators keyed by PickleIntel shot name
    const shotData  = {}; // { shotName: { pos, neu, neg } }
    const rallyData = {}; // { shotName: { won, lost } }
    let   errors    = 0;
    let   serves    = 0;
    let   returns   = 0;

    const initShot = (name) => {
      if (!shotData[name])  shotData[name]  = { pos: 0, neu: 0, neg: 0 };
      if (!rallyData[name]) rallyData[name] = { won: 0, lost: 0 };
    };

    // Walk every rally and every shot
    const rallies = payload.rallies || [];
    for (const rally of rallies) {
      if (rally.likely_bad) continue; // skip bad rallies flagged by PB Vision

      const shots = rally.shots || [];
      for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];

        // Only process shots hit by our player
        if (shot.player_index !== 0) continue; // TODO: use correct player index

        // Determine shot name
        let shotName = null;

        if (i === 0) {
          // First shot of rally = serve
          shotName = "Serve";
          serves++;
        } else if (i === 1) {
          // Second shot = return
          const side = shot.stroke_side === "backhand" ? "BH" : "FH";
          shotName = `Return ${side}`;
          returns++;
        } else if (i === 2 || i === 3) {
          // 3rd/4th shot
          const side = shot.stroke_side === "backhand" ? "BH" : "FH";
          shotName = `4th Shot ${side}`;
        } else {
          // All other shots — map by type + side
          const key = `${shot.shot_type}-${shot.stroke_side}`;
          shotName = shotMap[key] || null;

          // Speed-ups override the base shot type
          if (shot.is_speedup) {
            const side = shot.stroke_side === "backhand" ? "BH" : "FH";
            shotName = `Speed Up ${side}`;
          }
        }

        if (!shotName) continue;
        initShot(shotName);

        // Map PB Vision execution quality to pos/neu/neg
        // PB Vision quality scores are typically 0-1
        const quality = shot.execution_quality ?? shot.quality ?? null;
        if (quality !== null) {
          if (quality >= 0.65)      shotData[shotName].pos++;
          else if (quality >= 0.35) shotData[shotName].neu++;
          else                      shotData[shotName].neg++;
        }

        // Rally ender — was this the last shot and did we win?
        const isLastShot = i === shots.length - 1;
        if (isLastShot && shot.winner_type) {
          if (shot.winner_type === "winner") rallyData[shotName].won++;
          else if (shot.winner_type === "error" || shot.winner_type === "forced_error") {
            rallyData[shotName].lost++;
          }
        }

        // Unforced errors
        if (shot.is_error && !shot.is_forced_error) errors++;
      }
    }

    // ── Extract NVZ metrics ──────────────────────────────────────────────────
    const nvzArrival = Math.round((myPlayer.kitchen_arrival_percentage || 0) * 100);
    const teamNvz    = Math.round((myPlayer.team_kitchen_arrival || 0) * 100);

    // Serve neutralization: % of serves/returns that were positive or neutral quality
    const srShots    = ["Serve", "Return BH", "Return FH"];
    const srNeuPos   = srShots.reduce((a, n) => a + (shotData[n]?.pos || 0) + (shotData[n]?.neu || 0), 0);
    const srTotal    = srShots.reduce((a, n) => a + (shotData[n]?.pos || 0) + (shotData[n]?.neu || 0) + (shotData[n]?.neg || 0), 0);
    const serveNeut  = srTotal > 0 ? Math.round((srNeuPos / srTotal) * 100) : 0;

    // ── Save shot data to Supabase shots table (aggregate) ───────────────────
    for (const [name, d] of Object.entries(shotData)) {
      const total = d.pos + d.neu + d.neg;
      if (!total) continue;

      // Check if shot record exists
      const existingRes = await fetch(
        `${supabaseUrl}/rest/v1/shots?name=eq.${encodeURIComponent(name)}&user_id=eq.${userId}&select=id,pos_count,neu_count,neg_count,attempts`,
        { headers: { "Authorization": `Bearer ${supabaseKey}`, "apikey": supabaseKey } }
      );
      const existing = await existingRes.json();

      if (existing.length > 0) {
        const ex = existing[0];
        await fetch(`${supabaseUrl}/rest/v1/shots?id=eq.${ex.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
            "apikey": supabaseKey,
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            pos_count: (ex.pos_count || 0) + d.pos,
            neu_count: (ex.neu_count || 0) + d.neu,
            neg_count: (ex.neg_count || 0) + d.neg,
            attempts:  (ex.attempts  || 0) + total,
          }),
        });
      } else {
        await fetch(`${supabaseUrl}/rest/v1/shots`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
            "apikey": supabaseKey,
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            name,
            user_id:   userId,
            pos_count: d.pos,
            neu_count: d.neu,
            neg_count: d.neg,
            attempts:  total,
            wins:      rallyData[name]?.won  || 0,
            misses:    rallyData[name]?.lost || 0,
          }),
        });
      }
    }

    // ── Update rally data (wins/misses) separately ───────────────────────────
    for (const [name, r] of Object.entries(rallyData)) {
      const total = r.won + r.lost;
      if (!total) continue;

      const existingRes = await fetch(
        `${supabaseUrl}/rest/v1/shots?name=eq.${encodeURIComponent(name)}&user_id=eq.${userId}&select=id,wins,misses`,
        { headers: { "Authorization": `Bearer ${supabaseKey}`, "apikey": supabaseKey } }
      );
      const existing = await existingRes.json();
      if (existing.length > 0) {
        const ex = existing[0];
        await fetch(`${supabaseUrl}/rest/v1/shots?id=eq.${ex.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
            "apikey": supabaseKey,
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            wins:   (ex.wins   || 0) + r.won,
            misses: (ex.misses || 0) + r.lost,
          }),
        });
      }
    }

    // ── Save per-match shot data (match_shots table) ─────────────────────────
    await fetch(`${supabaseUrl}/rest/v1/match_shots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey,
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        match_id:      matchId,
        user_id:       userId,
        shot_data:     shotData,
        rally_data:    rallyData,
        nvz_arrived:   nvzArrival,
        nvz_total:     100,
        nvz_won:       teamNvz,
        nvz_won_total: 100,
        errors,
        serve_neut:    serveNeut,
      }),
    });

    // ── Update the match record with aggregate metrics ───────────────────────
    await fetch(`${supabaseUrl}/rest/v1/matches?id=eq.${matchId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        nvz_arrival: nvzArrival,
        serve_neut:  serveNeut,
        errors,
        pbv_analyzed: true,
      }),
    });

    // ── Update video_jobs status to complete ─────────────────────────────────
    const jobId = payload.id || payload.jobId || payload.videoId;
    if (jobId) {
      await fetch(`${supabaseUrl}/rest/v1/video_jobs?pbv_job_id=eq.${jobId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ status: "complete", completed_at: new Date().toISOString() }),
      });
    }

    console.log(`Webhook processed: matchId=${matchId} userId=${userId} shots=${Object.keys(shotData).length} errors=${errors}`);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("webhook.js error:", err);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}
