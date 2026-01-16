export async function onRequest(context) {
    const RIOT_API_KEY = context.env.RIOT_API_KEY;
    const REGION = 'euw1';
    const PUUID_REGION = 'europe';

    if (!RIOT_API_KEY) {
        return new Response(JSON.stringify({ error: "API Key no configurada" }), { status: 500 });
    }

    let trackedPlayers = [];
    try {
        trackedPlayers = await context.request.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: "Datos inválidos" }), { status: 400 });
    }

    if (!trackedPlayers || trackedPlayers.length === 0) {
        return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' }});
    }

    // Usamos Promise.all para procesar todos los jugadores a la vez
    const results = await Promise.all(trackedPlayers.map(async (playerBase) => {
        let status = {
            ...playerBase,
            isIngame: false,
            gameData: null,
            lastMatch: null,
            puuid: null,
            iconId: 29,
            rank: "UNRANKED"
        };

        try {
            // 1. Obtener PUUID (Account V1)
            const accountUrl = `https://${PUUID_REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${playerBase.gameName}/${playerBase.tagLine}?api_key=${RIOT_API_KEY}`;
            const accountRes = await fetch(accountUrl);
            if (!accountRes.ok) return status; // Si no existe, devolvemos datos vacíos
            const accountData = await accountRes.json();
            
            status.puuid = accountData.puuid;
            status.gameName = accountData.gameName;
            status.tagLine = accountData.tagLine; // Actualizamos el tag por si acaso mayúsculas/minúsculas

            // 2. Obtener Summoner ID (Summoner V4)
            const summonerUrl = `https://${REGION}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${status.puuid}?api_key=${RIOT_API_KEY}`;
            const summonerRes = await fetch(summonerUrl).then(r => r.json());
            status.summonerId = summonerRes.id;
            status.iconId = summonerRes.profileIconId;

            // 3. OBTENER RANGO (League V4) - ¡AHORA ESTÁ FUERA DEL IF DE PARTIDA!
            // Queremos saber si es Hierro siempre, juegue o no.
            try {
                const leagueUrl = `https://${REGION}.api.riotgames.com/lol/league/v4/entries/by-summoner/${status.summonerId}?api_key=${RIOT_API_KEY}`;
                const leagueRes = await fetch(leagueUrl).then(r => r.json());
                
                // Prioridad: SoloQ > Flex
                const soloQ = leagueRes.find(q => q.queueType === "RANKED_SOLO_5x5");
                const flexQ = leagueRes.find(q => q.queueType === "RANKED_FLEX_SR");
                const bestRank = soloQ || flexQ;

                if (bestRank) {
                    status.rank = `${bestRank.tier} ${bestRank.rank}`;
                }
            } catch (err) {
                console.log("Error obteniendo rango para " + status.gameName);
            }

            // 4. Mirar si está en partida (Spectator V4)
            const spectateUrl = `https://${REGION}.api.riotgames.com/lol/spectator/v4/active-games/by-summoner/${status.summonerId}?api_key=${RIOT_API_KEY}`;
            const liveGameRes = await fetch(spectateUrl);
            
            if (liveGameRes.status === 200) {
                const liveGame = await liveGameRes.json();
                status.isIngame = true;
                status.gameData = {
                    gameId: liveGame.gameId,
                    gameMode: liveGame.gameMode,
                    startTime: liveGame.gameStartTime,
                    encryptionKey: liveGame.observers?.encryptionKey, // El ? evita crash si no hay observers
                    championId: liveGame.participants.find(p => p.summonerId === status.summonerId)?.championId
                };
            }

            // 5. Si NO está jugando, obtener última partida (Match V5)
            if (!status.isIngame) {
                const matchesUrl = `https://${PUUID_REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${status.puuid}/ids?start=0&count=1&api_key=${RIOT_API_KEY}`;
                const matchIds = await fetch(matchesUrl).then(r => r.json());
                
                if (Array.isArray(matchIds) && matchIds.length > 0) {
                    const matchDetailUrl = `https://${PUUID_REGION}.api.riotgames.com/lol/match/v5/matches/${matchIds[0]}?api_key=${RIOT_API_KEY}`;
                    const matchData = await fetch(matchDetailUrl).then(r => r.json());
                    const p = matchData.info.participants.find(x => x.puuid === status.puuid);
                    status.lastMatch = {
                        win: p.win,
                        kda: `${p.kills}/${p.deaths}/${p.assists}`,
                        champion: p.championName
                    };
                }
            }
        } catch (e) { 
            console.error(`Error procesando a ${playerBase.gameName}:`, e);
        }

        return status;
    }));

    return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' }
    });
}