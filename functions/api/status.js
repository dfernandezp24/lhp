export async function onRequest(context) {
    // CLAVE PUESTA A FUEGO
    const RIOT_API_KEY = "RGAPI-79cef97a-f029-4542-b7d6-7f55e1aca0e1";
    
    const REGION = 'euw1'; 
    const PUUID_REGION = 'europe'; 

    let trackedPlayers = [];
    try {
        trackedPlayers = await context.request.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: "Datos inválidos" }), { status: 400 });
    }

    if (!trackedPlayers || trackedPlayers.length === 0) {
        return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' }});
    }

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
            // 1. PUUID
            const accountUrl = `https://${PUUID_REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${playerBase.gameName}/${playerBase.tagLine}?api_key=${RIOT_API_KEY}`;
            const accountRes = await fetch(accountUrl);
            if (!accountRes.ok) return status; 
            const accountData = await accountRes.json();
            
            status.puuid = accountData.puuid;
            status.gameName = accountData.gameName;
            status.tagLine = accountData.tagLine;

            // 2. Summoner ID
            const summonerUrl = `https://${REGION}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${status.puuid}?api_key=${RIOT_API_KEY}`;
            const summonerRes = await fetch(summonerUrl).then(r => r.json());
            status.summonerId = summonerRes.id;
            status.iconId = summonerRes.profileIconId;

            // 3. RANGO
            try {
                const leagueUrl = `https://${REGION}.api.riotgames.com/lol/league/v4/entries/by-summoner/${status.summonerId}?api_key=${RIOT_API_KEY}`;
                const leagueRes = await fetch(leagueUrl).then(r => r.json());
                const soloQ = leagueRes.find(q => q.queueType === "RANKED_SOLO_5x5");
                if (soloQ) status.rank = `${soloQ.tier} ${soloQ.rank}`;
            } catch (err) {}

            // 4. PARTIDA EN VIVO
            const spectateUrl = `https://${REGION}.api.riotgames.com/lol/spectator/v4/active-games/by-summoner/${status.summonerId}?api_key=${RIOT_API_KEY}`;
            const liveGameRes = await fetch(spectateUrl);
            
            if (liveGameRes.status === 200) {
                const liveGame = await liveGameRes.json();
                status.isIngame = true;
                status.gameData = {
                    gameId: liveGame.gameId,
                    gameMode: liveGame.gameMode,
                    startTime: liveGame.gameStartTime,
                    encryptionKey: liveGame.observers?.encryptionKey,
                    championId: liveGame.participants.find(p => p.summonerId === status.summonerId)?.championId
                };
            }

            // 5. ULTIMA PARTIDA (Si no juega)
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
        } catch (e) { }

        return status;
    }));

    return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' }
    });
}