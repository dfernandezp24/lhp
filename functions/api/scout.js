export async function onRequest(context) {
    // CLAVE PUESTA A FUEGO PARA QUE FUNCIONE YA
    const RIOT_API_KEY = "RGAPI-79cef97a-f029-4542-b7d6-7f55e1aca0e1";
    
    const REGION = 'euw1';        // Europa Oeste
    const ACCOUNT_REGION = 'europe'; 

    try {
        // 1. Pedimos la lista completa de jugadores en HIERRO IV de SoloQ
        const leagueUrl = `https://${REGION}.api.riotgames.com/lol/league/v4/entries/RANKED_SOLO_5x5/IRON/IV?page=1&api_key=${RIOT_API_KEY}`;
        
        const leagueResp = await fetch(leagueUrl);
        
        if (!leagueResp.ok) {
            // Si falla, devolvemos el error exacto para verlo en pantalla
            return new Response(JSON.stringify({ error: `Riot Error: ${leagueResp.status}` }), { status: leagueResp.status });
        }
        
        const leagueData = await leagueResp.json();
        
        if (leagueData.length === 0) {
            return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
        }

        // 2. Elegimos 6 jugadores AL AZAR
        const randomPicks = leagueData.sort(() => 0.5 - Math.random()).slice(0, 6);

        // 3. Averiguamos sus nombres (Nombre#TAG)
        const cleanPlayers = await Promise.all(randomPicks.map(async (p) => {
            try {
                // A. Conseguir PUUID
                const sumUrl = `https://${REGION}.api.riotgames.com/lol/summoner/v4/summoners/${p.summonerId}?api_key=${RIOT_API_KEY}`;
                const sumResp = await fetch(sumUrl);
                if (!sumResp.ok) return null;
                const sumData = await sumResp.json();

                // B. Conseguir Riot ID
                const accUrl = `https://${ACCOUNT_REGION}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${sumData.puuid}?api_key=${RIOT_API_KEY}`;
                const accResp = await fetch(accUrl);
                if (!accResp.ok) return null;
                const accData = await accResp.json();

                return {
                    gameName: accData.gameName,
                    tagLine: accData.tagLine,
                    wins: p.wins,
                    losses: p.losses,
                    hotStreak: p.hotStreak
                };
            } catch (err) {
                return null;
            }
        }));

        // Filtramos los que hayan fallado
        const finalResults = cleanPlayers.filter(p => p !== null);

        return new Response(JSON.stringify(finalResults), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}