export async function onRequest(context) {
    const RIOT_API_KEY = context.env.RIOT_API_KEY;
    const REGION = 'euw1';        
    const ACCOUNT_REGION = 'europe'; 

    // Función para esperar (Evita Rate Limit)
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    if (!RIOT_API_KEY) return new Response(JSON.stringify({ error: "CRITICO: No hay API Key configurada." }), { status: 500 });

    try {
        // 1. Buscamos la lista de Hierro IV
        const leagueUrl = `https://${REGION}.api.riotgames.com/lol/league/v4/entries/RANKED_SOLO_5x5/IRON/IV?page=1&api_key=${RIOT_API_KEY}`;
        const leagueResp = await fetch(leagueUrl);
        
        if (!leagueResp.ok) {
            return new Response(JSON.stringify({ error: `Error buscando Liga: ${leagueResp.status} ${leagueResp.statusText}` }), { status: leagueResp.status });
        }
        
        const leagueData = await leagueResp.json();
        if (leagueData.length === 0) return new Response(JSON.stringify({ error: "La liga HIERRO IV está vacía en Riot ahora mismo." }), { status: 404 });

        // Cogemos solo 2 para probar (Menos riesgo de bloqueo)
        const randomPicks = leagueData.sort(() => 0.5 - Math.random()).slice(0, 2);
        const results = [];
        const errorsLog = [];

        // 2. Bucle lento
        for (const p of randomPicks) {
            await delay(500); // Esperamos medio segundo entre jugadores

            try {
                // A. Conseguir PUUID
                const sumUrl = `https://${REGION}.api.riotgames.com/lol/summoner/v4/summoners/${p.summonerId}?api_key=${RIOT_API_KEY}`;
                const sumResp = await fetch(sumUrl);
                
                if (!sumResp.ok) {
                    errorsLog.push(`Fallo Summoner ${p.summonerId}: ${sumResp.status}`);
                    continue;
                }
                const sumData = await sumResp.json();

                // B. Conseguir Riot ID
                const accUrl = `https://${ACCOUNT_REGION}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${sumData.puuid}?api_key=${RIOT_API_KEY}`;
                const accResp = await fetch(accUrl);
                
                if (!accResp.ok) {
                    errorsLog.push(`Fallo Account ${sumData.puuid}: ${accResp.status}`);
                    continue;
                }
                const accData = await accResp.json();

                results.push({
                    gameName: accData.gameName,
                    tagLine: accData.tagLine,
                    wins: p.wins,
                    losses: p.losses,
                    rank: "IRON IV"
                });

            } catch (err) {
                errorsLog.push(`Error código: ${err.message}`);
            }
        }

        // Si no encontramos a nadie, devolvemos el log de errores para ver qué pasó
        if (results.length === 0) {
            return new Response(JSON.stringify({ 
                error: "No se pudieron obtener nombres",
                debug: errorsLog 
            }), { status: 500 });
        }

        return new Response(JSON.stringify(results), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: `Error General: ${err.message}` }), { status: 500 });
    }
}