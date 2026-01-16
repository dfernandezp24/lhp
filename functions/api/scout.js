export async function onRequest(context) {
    const RIOT_API_KEY = context.env.RIOT_API_KEY;
    const REGION = 'euw1';        
    const ACCOUNT_REGION = 'europe'; 

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    if (!RIOT_API_KEY) return new Response(JSON.stringify({ error: "Falta API Key" }), { status: 500 });

    try {
        const leagueUrl = `https://${REGION}.api.riotgames.com/lol/league/v4/entries/RANKED_SOLO_5x5/IRON/IV?page=1&api_key=${RIOT_API_KEY}`;
        const leagueResp = await fetch(leagueUrl);
        
        if (!leagueResp.ok) return new Response(JSON.stringify({ error: `League Error: ${leagueResp.status}` }), { status: leagueResp.status });
        
        const leagueData = await leagueResp.json();
        if (leagueData.length === 0) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

        const randomPicks = leagueData.sort(() => 0.5 - Math.random()).slice(0, 4);
        const validPlayers = [];

        for (const p of randomPicks) {
            await delay(100); 

            try {
                const accUrl = `https://${ACCOUNT_REGION}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${p.puuid}?api_key=${RIOT_API_KEY}`;
                const accResp = await fetch(accUrl);
                
                if (!accResp.ok) continue; 

                const accData = await accResp.json();

                const totalGames = p.wins + p.losses;
                const winRateCalc = totalGames > 0 ? Math.round((p.wins / totalGames) * 100) : 0;

                validPlayers.push({
                    gameName: accData.gameName,
                    tagLine: accData.tagLine,
                    leaguePoints: p.leaguePoints, 
                    wins: p.wins,
                    losses: p.losses,
                    winRate: winRateCalc, 
                    hotStreak: p.hotStreak,
                    rank: "IRON IV"
                });

            } catch (err) {
            }
        }

        return new Response(JSON.stringify(validPlayers), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}