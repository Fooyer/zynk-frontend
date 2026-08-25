// Espera a GitHub Release da versão atual aparecer na API antes de deixar o
// próximo `electron-builder --publish always` (Linux) rodar.
//
// `npm run release` já roda win e linux em sequência (um `electron-builder`
// termina, o processo seguinte só começa depois) — mas isso garante só que
// o PROCESSO acabou, não que a API do GitHub já reflete a release recém-
// criada no instante seguinte. O electron-builder decide se cria uma
// release nova ou reaproveita uma existente listando
// /repos/{owner}/{repo}/releases e procurando uma com a MESMA tag (ver
// gitHubPublisher.ts, getOrCreateRelease) — sem essa confirmação explícita,
// a corrida entre "processo win terminou" e "GitHub já indexou a release
// pro processo linux enxergar" era o que gerava 2 drafts "0.7.1" separados
// em vez de um só com os assets das duas plataformas.
const pkg = require('../package.json');

const OWNER = 'Fooyer';
const REPO = 'zynk-frontend';
const TAG = `v${pkg.version}`;
const MAX_ATTEMPTS = 15;
const DELAY_MS = 2000;

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function releaseExists() {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=100`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return false;
  const releases = await res.json();
  return Array.isArray(releases) && releases.some((r) => r.tag_name === TAG);
}

async function main() {
  if (!token) {
    console.warn('[wait-for-release] GH_TOKEN não definido — pulando verificação.');
    return;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (await releaseExists().catch(() => false)) {
      console.log(`[wait-for-release] Release ${TAG} confirmada na API do GitHub — seguindo para o próximo alvo.`);
      return;
    }
    await sleep(DELAY_MS);
  }

  console.warn(
    `[wait-for-release] Release ${TAG} não apareceu em ${(MAX_ATTEMPTS * DELAY_MS) / 1000}s — ` +
      'seguindo mesmo assim (pode acabar criando um draft separado; confira manualmente depois).',
  );
}

main();
