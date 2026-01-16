export async function onRequest(context) {
    const RIOT_API_KEY = context.env.RIOT_API_KEY; 
    const REGION = 'euw1'; 
    const PUUID_REGION = 'europe'; 

    if (!RIOT_API_KEY) return new Response(JSON.stringify({ error: "No API Key" }), { status: 500 });

    try {
        const randomPage = Math.floor(Math.random() * 10) + 1; 
        const leagueUrl = `https://${REGION}.api.riotgames.com/lol/league/v4/entries/RANKED_SOLO_5x5/IRON/IV?page=${randomPage}&api_key=${RIOT_API_KEY}`;
        
        const leagueRes = await fetch(leagueUrl);
        if (!leagueRes.ok) throw new Error("Fallo en Riot API");
        let entries = await leagueRes.json();

        entries = entries.filter(e => (e.wins + e.losses) > 20);
        
        entries.sort((a, b) => {
            const wrA = (a.wins / (a.wins + a.losses));
            const wrB = (b.wins / (b.wins + b.losses));
            return wrA - wrB;
        });

        const candidates = entries.slice(0, 4);

        const finalData = await Promise.all(candidates.map(async (c) => {
            try {
                const sumUrl = `https://${REGION}.api.riotgames.com/lol/summoner/v4/summoners/${c.summonerId}?api_key=${RIOT_API_KEY}`;
                const sumRes = await fetch(sumUrl).then(r => r.json());
                
                const accUrl = `https://${PUUID_REGION}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${sumRes.puuid}?api_key=${RIOT_API_KEY}`;
                const accRes = await fetch(accUrl).then(r => r.json());

                const total = c.wins + c.losses;
                const wr = Math.round((c.wins / total) * 100);

                return {
                    gameName: accRes.gameName,
                    tagLine: accRes.tagLine,
                    wins: c.wins,
                    losses: c.losses,
                    wr: wr,
                    lp: c.leaguePoints
                };
            } catch (e) {
                return null; 
            }
        }));

        const cleanData = finalData.filter(x => x !== null);

        return new Response(JSON.stringify(cleanData), { headers: { 'Content-Type': 'application/json' } });

    } catch (e) {
        return new Response(JSON.stringify({ error: "Error buscando jugadores" }), { status: 500 });
    }
}