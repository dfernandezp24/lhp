export async function onRequest(context) {
    const RIOT_API_KEY = context.env.RIOT_API_KEY;
    const REGION = 'euw1'; 

    if (!RIOT_API_KEY) return new Response("Falta API KEY", { status: 500 });

    try {
        // 1. Pedimos la lista
        const leagueUrl = `https://${REGION}.api.riotgames.com/lol/league/v4/entries/RANKED_SOLO_5x5/IRON/IV?page=1&api_key=${RIOT_API_KEY}`;
        const resp = await fetch(leagueUrl);

        if (!resp.ok) {
            return new Response(`Error Riot Fase 1: ${resp.status} - ${resp.statusText}`, { status: resp.status });
        }

        const data = await resp.json();

        // 2. ¡AQUÍ ESTÁ EL TRUCO! 
        // En vez de procesar, devolvemos los datos CRUDOS del primer jugador para ver sus "tripas".
        const sample = data.slice(0, 1); 

        return new Response(JSON.stringify({
            mensaje: "ESTO ES LO QUE NOS DEVUELVE RIOT",
            total_jugadores: data.length,
            ejemplo_jugador: sample
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}