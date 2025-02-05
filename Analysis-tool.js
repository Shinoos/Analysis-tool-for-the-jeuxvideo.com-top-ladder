let isPaused = false;
let currentPageNumber = 1;
const maxRetries = 10;
const retryDelay = 15000;


function pauseAnalysis() {
	if (isPaused) {
		console.log("L'analyse est déjà en pause.");
		return;
	}
	isPaused = true;
	console.log("Pause demandée.");
}

function resumeAnalysis() {
	if (!isPaused) {
		console.log("L'analyse n'est pas en pause.");
		return;
	}
	isPaused = false;
	console.log("Reprise de l'analyse.");
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchProfileData(profileUrl, retryCount = 0) {
	try {
		const response = await fetch(profileUrl);

		if (response.status === 429) {
			if (retryCount < maxRetries) {
				console.log(`Rate limit atteint pour ${profileUrl}, nouvelle tentative dans ${retryDelay/1000} secondes... (Tentative ${retryCount + 1}/${maxRetries})`);
				await delay(retryDelay);
				return fetchProfileData(profileUrl, retryCount + 1);
			} else {
				console.log(`Échec après ${maxRetries} tentatives pour ${profileUrl}`);
				return {
					messages: "erreur_429",
					level: "erreur_429"
				};
			}
		}

		const html = await response.text();
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const messagesElement = [...doc.querySelectorAll('.info-lib')].find(el => el.textContent.includes('Messages Forums'));
		const messages = messagesElement ? parseInt(messagesElement.nextElementSibling.textContent.trim().replace(/\D/g, '')) : "caché";
		const levelElement = doc.querySelector('.user-level .ladder-link');
		const level = levelElement ? levelElement.textContent.trim().replace('Niveau', '').trim() : "inconnu";

		return {
			messages,
			level
		};
	} catch (error) {
		if (retryCount < maxRetries) {
			console.log(`Erreur pour ${profileUrl}, nouvelle tentative... (Tentative ${retryCount + 1}/${maxRetries})`);
			await delay(retryDelay);
			return fetchProfileData(profileUrl, retryCount + 1);
		}

		console.error('Erreur lors de l\'extraction des données du profil:', error);
		return {
			messages: "erreur",
			level: "erreur"
		};
	}
}

async function analyzeLeaderboard(pageNumber) {
	const url = `https://www.jeuxvideo.com/concours/ladder/?p=${pageNumber}`;
	const response = await fetch(url);
	const html = await response.text();
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	const users = doc.querySelectorAll('.leaderboardRanking__rankingList');
	let globalCounter = (pageNumber - 1) * 50 + 1;

	if (isPaused) {
		console.log("Analyse en pause, en attente de reprise...");
		await new Promise(resolve => {
			const interval = setInterval(() => {
				if (!isPaused) {
					clearInterval(interval);
					resolve();
				}
			}, 100);
		});
	}

	const profilePromises = Array.from(users).map(async (user, index) => {
		const pseudo = user.querySelector('.leaderboardRanking__link')?.textContent.trim().toLowerCase();
		if (!pseudo) {
			console.error('Profil sans pseudo trouvé, impossible de continuer.');
			return null;
		}

		const profileUrl = `https://www.jeuxvideo.com/profil/${pseudo}?mode=infos`;
		const {
			messages,
			level
		} = await fetchProfileData(profileUrl);

		if (messages === "erreur_429") {
			console.log(`Profil ${pseudo} mis en attente pour réessai ultérieur`);
			return {
				pseudo,
				level: "en_attente",
				messages: "en_attente",
				retry: true,
				profileUrl
			};
		}

		console.log(`#${globalCounter + index} Pseudo: ${pseudo}, Niveau: ${level}, Messages: ${messages}`);
		return {
			pseudo,
			level,
			messages
		};
	});

	const results = await Promise.all(profilePromises);
	return results.filter(result => result !== null);
}

async function processAllPages() {
	let allLeaderboardData = [];
	let profilesToRetry = [];

	while (currentPageNumber <= 925) {
		console.log(`\nAnalyse de la page ${currentPageNumber}...`);
		const leaderboardData = await analyzeLeaderboard(currentPageNumber);

		const profilesSucceeded = leaderboardData.filter(p => !p.retry);
		const newProfilesToRetry = leaderboardData.filter(p => p.retry);

		allLeaderboardData = allLeaderboardData.concat(profilesSucceeded);
		profilesToRetry = profilesToRetry.concat(newProfilesToRetry);

		currentPageNumber++;

		await delay(1000);
	}

	if (profilesToRetry.length > 0) {
		console.log(`\nRéessai des ${profilesToRetry.length} profils qui ont échoué...`);
		for (const profil of profilesToRetry) {
			await delay(retryDelay);
			const {
				messages,
				level
			} = await fetchProfileData(profil.profileUrl);
			if (messages !== "erreur_429") {
				allLeaderboardData.push({
					pseudo: profil.pseudo,
					level,
					messages
				});
				console.log(`Profil récupéré avec succès: ${profil.pseudo}`);
			}
		}
	}

	allLeaderboardData.sort((a, b) => {
		const messagesA = a.messages === "caché" ? -1 : a.messages;
		const messagesB = b.messages === "caché" ? -1 : b.messages;
		return messagesB - messagesA;
	});

	const finalLeaderboard = allLeaderboardData.map((user, index) =>
		`#${index + 1} Pseudo: ${user.pseudo}, Niveau: ${user.level}, Messages: ${user.messages}`
	).join('\n');

	const endDate = new Date().toLocaleString();
	console.log("\nClassement final des plus gros posteurs :\n\n" + finalLeaderboard + `\n\nDate de fin: ${endDate}`);
}

processAllPages();
