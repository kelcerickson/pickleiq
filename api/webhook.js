// api/webhook.js
// Receives PB Vision's callback when video analysis completes.
// Maps PB Vision shot data to PickleIntel's schema and saves to Supabase.
// Updated to use final PickleIntel taxonomy (4 categories, no Attack/Defense split)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  try {
    const payload = req.body;
    const matchId = payload.metadata?.matchId;
    const userId  = payload.metadata?.userId;

    if (!matchId || !userId) {
      console.error("Webhook missing matchId or userId", payload.metadata);
      return res.status(400).json({ error: "Missing metadata" });
    }

    const players = payload.player_data || [];
    const myPlayer = players[0] || {};

    // ── PB Vision → PickleIntel shot taxonomy mapping ────────────────────────
    // PBV types: drive, drop, dink, smash, lob, atp, erne, reset, speedup
    // PickleIntel categories: Serve/Return | Transition | Kitchen | Specialty
    const shotMap = {
      // Transition
      "drive-forehand":    "Drive FH",
      "drive-backhand":    "Drive BH",
      "drop-forehand":     "Drop FH",
      "drop-backhand":     "Drop BH",
      // Kitchen
      "dink-forehand":     "Dink FH",
      "dink-backhand":     "Dink BH",
      "reset-forehand":    "Reset FH",
      "reset-backhand":    "Reset BH",
      "volley-forehand":   "Volley FH",
      "volley-backhand":   "Volley BH",
      // Specialty — offensive
      "smash-forehand":    "Overhead / Smash",
      "smash-backhand":    "Overhead / Smash",
      "speedup-forehand":  "Speed-up FH",
      "speedup-backhand":  "Speed-up BH",
      "erne-forehand":     "Erne",
      "erne-backhand":     "Erne",
      "atp-forehand":      "ATP",
      "atp-backhand":      "ATP",
      // Specialty — defensive
      "lob-forehand":      "Lob FH",
      "lob-backhand":      "Lob BH",
      "counter-forehand":  "Counter FH",
      "counter-backhand":  "Counter BH",
      // PBV sometimes uses volley-drive for transition volleys — map to Drive
      "volley_drive-forehand": "Drive FH",
      "volley_drive-backhand": "Drive BH",
    };

    const shotData  = {};
    const rallyData = {};
    let errors = 0;

    const initShot = (name) => {
      if (!shotData[name])  shotData[name]  = { pos: 0, neu: 0, neg: 0 };
      if (!rallyData[name]) rallyData[name] = { won: 0, lost: 0 };
    };

    const rallies = payload.rallies || [];
    for (const rally of rallies) {
      if (rally.likely_bad) continue;

      const shots = rally.shots || [];
      for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        if (shot.player_index !== 0) continue;

        let shotName = null;

        if (i === 0) {
          // Serve — first shot of every rally
          shotName = "Serve";
        } else if (i === 1) {
          // Return — second shot
          const side = shot.stroke_side === "backhand" ? "BH" : "FH";
          shotName = `Return ${side}`;
        } else {
          // All other shots — map by type + side
          const key = `${shot.shot_type}-${shot.stroke_side}`;
          shotName = shotMap[key] || null;

          // Speed-up flag overrides base type
          if (shot.is_speedup) {
            const side = shot.stroke_side === "backhand" ? "BH" : "FH";
            shotName = `Speed-up ${side}`;
          }

          // If unmapped, store as-is for correction screen to handle
          if (!shotName && shot.shot_type) {
            const side = shot.stroke_side === "backhand" ? "BH" : "FH";
            shotName = `${shot.shot_type} ${side}`;
          }
        }

        if (!shotName) continue;
        initShot(shotName);

        // Map PBV quality score (0-1) → pos/neu/neg
        const quality = shot.execution_quality ?? shot.quality ?? null;
        if (quality !== null) {
          if (quality >= 0.65)      shotData[shotName].pos++;
          else if (quality >= 0.35) shotData[shotName].neu++;
          else                      shotData[shotName].neg++;
        }

        // Rally ender
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

    // ── NVZ metrics ──────────────────────────────────────────────────────────
    const nvzArrival = Math.round((myPlayer.kitchen_arrival_percentage || 0) * 100);
    const teamNvz    = Math.round((myPlayer.team_kitchen_arrival || 0) * 100);

    const srShots  = ["Serve", "Return BH", "Return FH"];
    const srNeuPos = srShots.reduce((a,n) => a + (shotData[n]?.pos||0) + (shotData[n]?.neu||0), 0);
    const srTotal  = srShots.reduce((a,n) => a + (shotData[n]?.pos||0) + (shotData[n]?.neu||0) + (shotData[n]?.neg||0), 0);
    const serveNeut = srTotal > 0 ? Math.round((srNeuPos / srTotal) * 100) : 0;

    // ── Save to Supabase shots table (aggregate) ─────────────────────────────
    for (const [name, d] of Object.entries(shotData)) {
      const total = d.pos + d.neu + d.neg;
      if (!total) continue;

      const existingRes = await fetch(
        `${supabaseUrl}/rest/v1/shots?name=eq.${encodeURIComponent(name)}&user_id=eq.${userId}&select=id,pos_count,neu_count,neg_count,attempts`,
        { headers: { "Authorization": `Bearer ${supabaseKey}`, "apikey": supabaseKey } }
      );
      const existing = await existingRes.json();

      if (existing.length > 0) {
        const ex = existing[0];
        await fetch(`${supabaseUrl}/rest/v1/shots?id=eq.${ex.id}`, {
          method: "PATCH",
          headers: { "Content-Type":"application/json", "Authorization":`Bearer ${supabaseKey}`, "apikey":supabaseKey, "Prefer":"return=minimal" },
          body: JSON.stringify({
            pos_count: (ex.pos_count||0) + d.pos,
            neu_count: (ex.neu_count||0) + d.neu,
            neg_count: (ex.neg_count||0) + d.neg,
            attempts:  (ex.attempts||0)  + total,
          }),
        });
      } else {
        await fetch(`${supabaseUrl}/rest/v1/shots`, {
          method: "POST",
          headers: { "Content-Type":"application/json", "Authorization":`Bearer ${supabaseKey}`, "apikey":supabaseKey, "Prefer":"return=minimal" },
          body: JSON.stringify({
            name, user_id: userId,
            pos_count: d.pos, neu_count: d.neu, neg_count: d.neg, attempts: total,
            wins: rallyData[name]?.won||0, misses: rallyData[name]?.lost||0,
          }),
        });
      }
    }

    // ── Update rally wins/misses ─────────────────────────────────────────────
    for (const [name, r] of Object.entries(rallyData)) {
      const total = r.won + r.lost;
      if (!total) continue;
      const existingRes = await fetch(
        `${supabaseUrl}/rest/v1/shots?name=eq.${encodeURIComponent(name)}&user_id=eq.${userId}&select=id,wins,misses`,
        { headers: { "Authorization":`Bearer ${supabaseKey}`, "apikey":supabaseKey } }
      );
      const existing = await existingRes.json();
      if (existing.length > 0) {
        const ex = existing[0];
        await fetch(`${supabaseUrl}/rest/v1/shots?id=eq.${ex.id}`, {
          method: "PATCH",
          headers: { "Content-Type":"application/json", "Authorization":`Bearer ${supabaseKey}`, "apikey":supabaseKey, "Prefer":"return=minimal" },
          body: JSON.stringify({ wins:(ex.wins||0)+r.won, misses:(ex.misses||0)+r.lost }),
        });
      }
    }

    // ── Save per-match shot data ──────────────────────────────────────────────
    await fetch(`${supabaseUrl}/rest/v1/match_shots`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${supabaseKey}`, "apikey":supabaseKey, "Prefer":"resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        match_id: matchId, user_id: userId,
        shot_data: shotData, rally_data: rallyData,
        nvz_arrived: nvzArrival, nvz_total: 100,
        nvz_won: teamNvz, nvz_won_total: 100,
        errors, serve_neut: serveNeut,
      }),
    });

    // ── Update match record ───────────────────────────────────────────────────
    await fetch(`${supabaseUrl}/rest/v1/matches?id=eq.${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${supabaseKey}`, "apikey":supabaseKey, "Prefer":"return=minimal" },
      body: JSON.stringify({ nvz_arrival:nvzArrival, serve_neut:serveNeut, errors, pbv_analyzed:true }),
    });

    // ── Update video_jobs status ──────────────────────────────────────────────
    const jobId = payload.id || payload.jobId || payload.videoId;
    if (jobId) {
      await fetch(`${supabaseUrl}/rest/v1/video_jobs?pbv_job_id=eq.${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${supabaseKey}`, "apikey":supabaseKey, "Prefer":"return=minimal" },
        body: JSON.stringify({ status:"complete", completed_at:new Date().toISOString() }),
      });
    }

    console.log(`Webhook processed: matchId=${matchId} shots=${Object.keys(shotData).length} errors=${errors}`);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("webhook.js error:", err);
    return res.status(500).json({ error:"Internal server error", detail:err.message });
  }
}
