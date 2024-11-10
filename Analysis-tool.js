async function fetchProfileData(profileUrl) {
    try {
        const response = await fetch(profileUrl);
        const html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const messagesElement = [...doc.querySelectorAll('.info-lib')].find(el => el.textContent.includes('Messages Forums'));
        const messages = messagesElement ? parseInt(messagesElement.nextElementSibling.textContent.trim().replace(/\D/g, '')) : "caché";

        const levelElement = doc.querySelector('.user-level .ladder-link');
        const level = levelElement ? levelElement.textContent.trim().replace('Niveau', '').trim() : "inconnu";

        return { messages, level };

    } catch (error) {
        console.error('Erreur lors de l\'extraction des données du profil:', error);
        return { messages: "caché", level: "inconnu" };
    }
}

async function analyzeLeaderboard(pageNumber) {
    const leaderboardData = [];
    const url = `https://www.jeuxvideo.com/concours/ladder/?p=${pageNumber}`;

    const response = await fetch(url);
    const html = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const users = doc.querySelectorAll('.leaderboardRanking__rankingList');
    let globalCounter = (pageNumber - 1) * 50 + 1;

    for (let user of users) {
        const pseudo = user.querySelector('.leaderboardRanking__link') ? user.querySelector('.leaderboardRanking__link').textContent.trim().toLowerCase() : null;

        if (!pseudo) {
            console.error('Profil sans pseudo trouvé, impossible de continuer.');
            continue;
        }

        const profileUrl = `https://www.jeuxvideo.com/profil/${pseudo}?mode=infos`;

        const { messages, level } = await fetchProfileData(profileUrl);

        leaderboardData.push({
            pseudo: pseudo,
            level: level,
            messages: messages
        });

        console.log(`#${globalCounter} Pseudo: ${pseudo}, Niveau: ${level}, Messages: ${messages}`);

        globalCounter++;
    }

    return leaderboardData;
}

async function processAllPages() {
    let pageNumber = 1;
    let allLeaderboardData = [];

    while (pageNumber <= 925) { // ← À ajuster selon besoin 
        console.log(`\nAnalyse de la page ${pageNumber}...`);

        const leaderboardData = await analyzeLeaderboard(pageNumber);
        allLeaderboardData = allLeaderboardData.concat(leaderboardData);

        pageNumber++;
    }

    allLeaderboardData.sort((a, b) => {
        const messagesA = a.messages === "caché" ? -1 : a.messages;
        const messagesB = b.messages === "caché" ? -1 : b.messages;
        return messagesB - messagesA;
    });

    const classementFinal = allLeaderboardData.map((user, index) => 
        `#${index + 1} Pseudo: ${user.pseudo}, Niveau: ${user.level}, Messages: ${user.messages}`
    ).join('\n');

    const endDate = new Date().toLocaleString();

    console.log("\nClassement final des plus gros posteurs :\n\n" + classementFinal + `\n\nDate de fin: ${endDate}`);
}

processAllPages();