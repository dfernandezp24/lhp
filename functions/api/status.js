export async function onRequest(context) {
    const RIOT_API_KEY = context.env.RIOT_API_KEY;
    const REGION = 'euw1'; 
    const PUUID_REGION = 'europe';

    let trackedPlayers = [];
    try { trackedPlayers = await context.request.json(); } catch (e) { return new Response("Error", {status: 400}); }

    if (!trackedPlayers || trackedPlayers.length === 0) return new Response("[]");

    const results = await Promise.all(trackedPlayers.map(async (playerBase) => {
        let status = {
            ...playerBase, isIngame: false, gameData: null, lastMatch: null, puuid: null, iconId: 29, rank: "UNRANKED"
        };

        try {
            const accountUrl = `https://${PUUID_REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${playerBase.gameName}/${playerBase.tagLine}?api_key=${RIOT_API_KEY}`;
            const accountRes = await fetch(accountUrl);
            if (!accountRes.ok) return status; 
            const accountData = await accountRes.json();
            
            status.puuid = accountData.puuid;
            status.gameName = accountData.gameName;
            status.tagLine = accountData.tagLine;

            const summonerUrl = `https://${REGION}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${status.puuid}?api_key=${RIOT_API_KEY}`;
            const summonerRes = await fetch(summonerUrl).then(r => r.json());
            status.summonerId = summonerRes.id;
            status.iconId = summonerRes.profileIconId;

            try {
                const leagueUrl = `https://${REGION}.api.riotgames.com/lol/league/v4/entries/by-summoner/${status.summonerId}?api_key=${RIOT_API_KEY}`;
                const leagueRes = await fetch(leagueUrl).then(r => r.json());
                const soloQ = leagueRes.find(q => q.queueType === "RANKED_SOLO_5x5");
                if (soloQ) status.rank = `${soloQ.tier} ${soloQ.rank}`;
            } catch (err) {}

            const spectateUrl = `https://${REGION}.api.riotgames.com/lol/spectator/v4/active-games/by-summoner/${status.summonerId}?api_key=${RIOT_API_KEY}`;
            const liveGameRes = await fetch(spectateUrl);
            
            if (liveGameRes.status === 200) {
                const liveGame = await liveGameRes.json();
                status.isIngame = true;

                const me = liveGame.participants.find(p => p.summonerId === status.summonerId);
                const myTeamId = me ? me.teamId : 100;

                const allies = liveGame.participants
                    .filter(p => p.teamId === myTeamId && p.summonerId !== status.summonerId)
                    .map(p => ({
                        name: p.riotId?.split('#')[0] || p.summonerName, 
                        tag: p.riotId?.split('#')[1] || "EUW",
                        championId: p.championId
                    }));

                status.gameData = {
                    gameId: liveGame.gameId,
                    gameMode: liveGame.gameMode,
                    startTime: liveGame.gameStartTime,
                    encryptionKey: liveGame.observers?.encryptionKey,
                    participants: allies 
                };
            }

            const matchesUrl = `https://${PUUID_REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${status.puuid}/ids?start=0&count=1&api_key=${RIOT_API_KEY}`;
            const matchIds = await fetch(matchesUrl).then(r => r.json());
            
            if (Array.isArray(matchIds) && matchIds.length > 0) {
                const matchDetailUrl = `https://${PUUID_REGION}.api.riotgames.com/lol/match/v5/matches/${matchIds[0]}?api_key=${RIOT_API_KEY}`;
                const matchData = await fetch(matchDetailUrl).then(r => r.json());
                
                const p = matchData.info.participants.find(x => x.puuid === status.puuid);
                const myTeamId = p.teamId;

                const pastAllies = matchData.info.participants
                    .filter(x => x.teamId === myTeamId && x.puuid !== status.puuid)
                    .map(x => ({
                        name: x.riotIdGameName, 
                        tag: x.riotIdTagLine,
                        championName: x.championName 
                    }));
                
                status.lastMatch = {
                    win: p.win,
                    kda: `${p.kills}/${p.deaths}/${p.assists}`,
                    champion: p.championName,
                    gameMode: matchData.info.gameMode,
                    participants: pastAllies 
                };
            }

        } catch (e) { }
        return status;
    }));

    return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
}