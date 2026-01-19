async function fetchStatus() {
    const container = document.getElementById('grid-container');

    if (myPlayers.length === 0) {
        container.innerHTML = '<div class="loading">LISTA VACÍA. AÑADE UN JUGADOR ARRIBA.</div>';
        return;
    }
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(myPlayers)
        });

        if (!response.ok) {
            throw new Error(`Error del servidor: ${response.status}`);
        }

        const playersData = await response.json();
        
        if (playersData.error) {
            container.innerHTML = `<div style="color:var(--accent-red); text-align:center">${playersData.error}</div>`;
            return;
        }

        container.innerHTML = ''; 
        let newGameDetected = false;

        playersData.forEach((p, index) => {
            const uniqueId = p.gameName + p.tagLine;
            
            // Lógica de detección de partida nueva para la alarma
            if (p.isIngame) {
                if (lastGameIds[uniqueId] !== p.gameData.gameId) {
                    newGameDetected = true;
                    lastGameIds[uniqueId] = p.gameData.gameId;
                }
            } else {
                delete lastGameIds[uniqueId];
            }

            let imgUrl = `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/img/profileicon/${p.iconId || 29}.png`;
            let statusBadge = '';

            // --- SECCIÓN 1: RUEDA DE WINRATE Y RANK ---
            let winrateHtml = '';
            if (p.rank && p.rank !== "UNRANKED") {
                const wr = p.winrate || 0;
                const totalGames = (p.wins || 0) + (p.losses || 0);
                
                // Color dinámico para la rueda
                let wrColor = '#ebbf0c'; // Amarillo (Mid)
                if (wr >= 50) wrColor = 'var(--accent-green)'; // Verde (Good)
                if (wr < 48) wrColor = 'var(--accent-red)';   // Rojo (Bad)

                // Gradiente cónico para el donut
                const wheelStyle = `background: conic-gradient(${wrColor} ${wr}%, #333 0);`;
                
                // Color del texto del rango (Iron = gris, otros = blanco)
                const rankColor = p.rank.includes("IRON") ? "#a19d94" : "#fff";

                winrateHtml = `
                    <div class="stats-container">
                        <div class="wheel-wrapper" style="${wheelStyle}">
                            <span class="wheel-text" style="color:${wrColor}">${wr}%</span>
                        </div>
                        <div class="winrate-details">
                            <div class="rank-text" style="color:${rankColor}">${p.rank}</div>
                            <div class="wl-text">${p.wins}W - ${p.losses}L (${totalGames})</div>
                        </div>
                    </div>
                `;
            } else {
                winrateHtml = `
                    <div class="stats-container" style="border-bottom: 1px dashed #333; opacity:0.5;">
                        <div class="winrate-details">
                            <div class="rank-text">UNRANKED</div>
                            <div class="wl-text">Sin datos de SoloQ</div>
                        </div>
                    </div>
                `;
            }

            // --- SECCIÓN 2: PARTIDA EN VIVO (LIVE) ---
            let liveHtml = '';
            let liveTeamHtml = '';

            if (p.isIngame) {
                statusBadge = `<div class="status-badge live"><div class="dot"></div> LIVE NOW</div>`;
                const minutes = Math.floor((Date.now() - p.gameData.startTime) / 60000);

                liveHtml = `
                    <div style="margin-top:5px;">MODO: <span class="highlight">${p.gameData.gameMode}</span></div>
                    <div>TIEMPO: <span class="highlight">${minutes > 0 ? minutes + ' min' : 'Iniciando'}</span></div>
                `;

                if (p.gameData.participants) {
                    let teamRows = p.gameData.participants.map(ally => {
                        return `
                        <div class="teammate-row">
                            <span style="color:#aaa;">${ally.championId}</span> <span style="color:#fff;">${ally.name}</span>
                            <button class="btn-quick-add" onclick="quickAdd('${ally.name}', '${ally.tag}')">FICHAR</button>
                        </div>
                    `}).join('');

                    liveTeamHtml = `
                        <details class="team-list">
                            <summary>👥 VER EQUIPO ACTUAL</summary>
                            ${teamRows}
                        </details>
                    `;
                }
            }

            // --- SECCIÓN 3: ÚLTIMA PARTIDA (HISTORIAL) ---
            let lastMatchHtml = '';
            
            if (p.lastMatch) {
                const color = p.lastMatch.win ? 'var(--accent-green)' : 'var(--accent-red)';
                const resultText = p.lastMatch.win ? 'WIN' : 'LOSS';
                
                if (!p.isIngame) {
                    statusBadge = p.lastMatch.win 
                        ? `<div class="status-badge victory">VICTORIA</div>`
                        : `<div class="status-badge defeat">DERROTA</div>`;
                }

                let pastTeamHtml = '';
                if (p.lastMatch.participants) {
                    let rows = p.lastMatch.participants.map(ally => {
                        return `
                        <div class="teammate-row">
                            <span style="color:#aaa;">${ally.championName}</span>
                            <span style="color:#fff;">${ally.name}</span>
                            <button class="btn-quick-add" onclick="quickAdd('${ally.name}', '${ally.tag}')">FICHAR</button>
                        </div>
                    `}).join('');
                    
                    pastTeamHtml = `
                        <details class="team-list" style="margin-top:5px; border-color:#333;">
                            <summary style="color:#666; font-size:0.7rem;">👥 VER EQUIPO DE ESTA PARTIDA</summary>
                            ${rows}
                        </details>
                    `;
                }

                lastMatchHtml = `
                    <div style="margin-top:10px; padding-top:8px; border-top:1px dashed #333; font-size:0.85rem;">
                        <div style="color:#666; font-size:0.7rem; font-weight:bold; margin-bottom:2px;">ÚLTIMA PARTIDA:</div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span>${p.lastMatch.champion}</span>
                            <span style="color:${color}; font-weight:bold;">${p.lastMatch.kda} (${resultText})</span>
                        </div>
                        ${pastTeamHtml} 
                    </div>
                `;
            } else {
                 if (!p.isIngame) statusBadge = `<div class="status-badge unknown">SIN DATOS</div>`;
            }

            // Construcción final de la tarjeta
            const opggLink = `https://www.op.gg/summoners/euw/${p.gameName}-${p.tagLine}`;
            const spectateCmd = p.isIngame ? `cd C:\\Riot Games\\League of Legends\\Game && "League of Legends.exe" "spectator spectator.euw1.lol.riotgames.com:80 ${p.gameData.encryptionKey} ${p.gameData.gameId} EUW1" "-UseRads"` : "";

            const actionBtn = p.isIngame 
                ? `<button class="btn btn-spectate" onclick='copyToClipboard(\`${spectateCmd}\`)'>📡 CONECTAR (CMD)</button>`
                : `<button class="btn" disabled style="opacity:0.3">OFFLINE</button>`;
            
            const card = document.createElement('div');
            card.className = `card ${p.isIngame ? 'ingame' : ''}`;
            
            card.innerHTML = `
                <div class="delete-btn" onclick="removePlayer(${index})">×</div>
                <div class="card-header">
                    <img src="${imgUrl}" class="profile-icon" onerror="this.src='https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Poro_0.jpg'">
                    <div class="player-info">
                        <div class="player-name">${p.gameName}</div>
                        <div class="tag">#${p.tagLine}</div>
                    </div>
                    ${statusBadge}
                </div>
                <div class="info-block">
                    ${winrateHtml}   ${liveHtml}      
                    ${liveTeamHtml}   
                    ${lastMatchHtml}  
                </div>
                <div class="actions">
                    <a href="${opggLink}" target="_blank" class="btn">OP.GG</a>
                    ${actionBtn}
                </div>
            `;
            container.appendChild(card);
        });

        if (newGameDetected) triggerAlarm();

    } catch (error) { console.error("Error:", error); }
}