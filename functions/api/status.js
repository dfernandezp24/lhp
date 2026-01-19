export async function onRequest(context) {
    const RIOT_API_KEY = context.env.RIOT_API_KEY;
    const REGION = 'euw1'; 
    const PUUID_REGION = 'europe'; 

    if (!RIOT_API_KEY) return new Response(JSON.stringify({ error: "Falta API Key" }), { status: 500 });

    let trackedPlayers = [];
    try { trackedPlayers = await context.request.json(); } catch (e) { return new Response("Error body", {status: 400}); }

    if (!trackedPlayers || trackedPlayers.length === 0) return new Response("[]");

    const getRealIdentity = async (puuid) => {
        try {
            const accUrl = `https://${PUUID_REGION}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}?api_key=${RIOT_API_KEY}`;
            const r = await fetch(accUrl);
            if (r.ok) {
                const d = await r.json();
                return { name: d.gameName, tag: d.tagLine };
            }
        } catch (e) {}
        return null;
    };

    const results = await Promise.all(trackedPlayers.map(async (playerBase) => {
        // Objeto base por defecto (si todo falla, devuelve esto)
        let status = {
            ...playerBase, isIngame: false, gameData: null, lastMatch: null, puuid: null, iconId: 29, 
            rank: "UNRANKED", wins: 0, losses: 0, winrate: 0
        };

        try {
            // 1. Obtener PUUID (Account V1)
            const accountUrl = `https://${PUUID_REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${playerBase.gameName}/${playerBase.tagLine}?api_key=${RIOT_API_KEY}`;
            const accountRes = await fetch(accountUrl);
            
            if (!accountRes.ok) return status; // Si no existe el usuario, devolvemos el objeto base y seguimos con el siguiente
            
            const accountData = await accountRes.json();
            status.puuid = accountData.puuid;
            status.gameName = accountData.gameName; // Corregimos mayúsculas/minúsculas
            status.tagLine = accountData.tagLine;

            // 2. Obtener Summoner ID (Summoner V4)
            const summonerUrl = `https://${REGION}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${status.puuid}?api_key=${RIOT_API_KEY}`;
            const summonerRes = await fetch(summonerUrl);
            
            if (!summonerRes.ok) return status; // Si falla, paramos aquí para este jugador
            
            const summonerData = await summonerRes.json();
            status.summonerId = summonerData.id;
            status.iconId = summonerData.profileIconId;

            // 3. Obtener Liga/Rank (League V4) - AQUI FALLABA ANTES
            try {
                const leagueUrl = `https://${REGION}.api.riotgames.com/lol/league/v4/entries/by-summoner/${status.summonerId}?api_key=${RIOT_API_KEY}`;
                const leagueRes = await fetch(leagueUrl).then(r => r.json());
                
                // COMPROBACIÓN CRÍTICA: Solo buscamos si es un Array válido
                if (Array.isArray(leagueRes)) {
                    const soloQ = leagueRes.find(q => q.queueType === "RANKED_SOLO_5x5");
                    if (soloQ) {
                        status.rank = `${soloQ.tier} ${soloQ.rank}`;
                        status.wins = soloQ.wins;
                        status.losses = soloQ.losses;
                        const total = soloQ.wins + soloQ.losses;
                        status.winrate = total > 0 ? Math.round((soloQ.wins / total) * 100) : 0;
                    }
                }
            } catch (err) { /* Ignoramos errores de liga, se queda en UNRANKED */ }

            // 4. In-Game (Spectator V4)
            try {
                const spectateUrl = `https://${REGION}.api.riotgames.com/lol/spectator/v4/active-games/by-summoner/${status.summonerId}?api_key=${RIOT_API_KEY}`;
                const liveGameRes = await fetch(spectateUrl);
                
                if (liveGameRes.status === 200) {
                    const liveGame = await liveGameRes.json();
                    status.isIngame = true;

                    // Identificar aliados
                    const me = liveGame.participants.find(p => p.summonerId === status.summonerId);
                    const myTeamId = me ? me.teamId : 100;
                    const rawAllies = liveGame.participants.filter(p => p.teamId === myTeamId && p.summonerId !== status.summonerId);
                    
                    const processedAllies = await Promise.all(rawAllies.map(async (p) => {
                        let identity = { name: p.summonerName, tag: "EUW" };
                        // Intentamos sacar el nombre real si tiene PUUID
                        if (p.puuid) {
                            const realData = await getRealIdentity(p.puuid);
                            if (realData) identity = realData;
                        }
                        return { name: identity.name, tag: identity.tag, championId: p.championId };
                    }));

                    status.gameData = {
                        gameId: liveGame.gameId,
                        gameMode: liveGame.gameMode,
                        startTime: liveGame.gameStartTime,
                        encryptionKey: liveGame.observers?.encryptionKey,
                        participants: processedAllies 
                    };
                }
            } catch (err) {}

            // 5. Historial (Match V5)
            try {
                const matchesUrl = `https://${PUUID_REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${status.puuid}/ids?start=0&count=1&api_key=${RIOT_API_KEY}`;
                const matchIds = await fetch(matchesUrl).then(r => r.json());
                
                // COMPROBACIÓN CRÍTICA: Verificar que es array y tiene elementos
                if (Array.isArray(matchIds) && matchIds.length > 0) {
                    const matchDetailUrl = `https://${PUUID_REGION}.api.riotgames.com/lol/match/v5/matches/${matchIds[0]}?api_key=${RIOT_API_KEY}`;
                    const matchData = await fetch(matchDetailUrl).then(r => r.json());
                    
                    if (matchData && matchData.info) {
                        const p = matchData.info.participants.find(x => x.puuid === status.puuid);
                        if (p) {
                            const rawPastAllies = matchData.info.participants.filter(x => x.teamId === p.teamId && x.puuid !== status.puuid);
                            const processedPastAllies = await Promise.all(rawPastAllies.map(async (x) => {
                                let identity = { name: x.riotIdGameName || x.summonerName, tag: x.riotIdTagLine || "EUW" };
                                if (!x.riotIdTagLine) {
                                    const realData = await getRealIdentity(x.puuid);
                                    if(realData) identity = realData;
                                }
                                return { name: identity.name, tag: identity.tag, championName: x.championName };
                            }));

                            status.lastMatch = {
                                win: p.win,
                                kda: `${p.kills}/${p.deaths}/${p.assists}`,
                                champion: p.championName,
                                gameMode: matchData.info.gameMode,
                                participants: processedPastAllies 
                            };
                        }
                    }
                }
            } catch (err) {}

        } catch (e) { 
            console.error("Error procesando jugador:", playerBase.gameName, e);
            // Devolvemos el status parcial si hubo un error fatal, para no romper el array
        }
        return status;
    }));

    return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
}