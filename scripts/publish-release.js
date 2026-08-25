// Publica no GitHub Releases os artefatos já gerados em `release/` (por
// `build:win` + `build:linux`, ambos com --publish never) — tudo numa
// release só, com upload de cada arquivo em sequência.
//
// Não usa o publish nativo do electron-builder: ele tem um bug conhecido
// (PublishManager.getOrCreatePublisher cacheava o publisher só DEPOIS de
// esperar a criação da release, então uploads concorrentes — mesmo de
// processos win/linux separados rodando em sequência — podiam cada um achar
// que a release ainda não existia e criar a sua própria, ou espalhar
// arquivos entre releases diferentes). Só foi corrigido numa versão alpha
// (27.0.0-alpha.7) — arriscado demais depender disso num pipeline de
// release real. Aqui a resolução da release (existe? cria?) acontece uma
// vez só, ANTES de qualquer upload — sem essa corrida.
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

const OWNER = 'Fooyer';
const REPO = 'zynk-frontend';
const TAG = `v${pkg.version}`;
const RELEASE_DIR = path.join(__dirname, '..', 'release');

// Só os artefatos que o electron-updater e os instaladores de fato
// precisam — ignora `builder-effective-config.yaml`, pastas *-unpacked/
// etc. que o electron-builder também deixa em `release/`.
const ASSET_EXTENSIONS = new Set(['.exe', '.blockmap', '.yml', '.appimage', '.dmg', '.zip']);

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
};

async function api(pathname, options = {}) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${options.method || 'GET'} ${pathname} -> ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

async function getOrCreateRelease() {
  const releases = await api(`/repos/${OWNER}/${REPO}/releases?per_page=100`);
  const existing = releases.find((r) => r.tag_name === TAG);
  if (existing) {
    console.log(`[publish-release] Reaproveitando release existente: ${TAG} (id=${existing.id}, draft=${existing.draft})`);
    return existing;
  }
  console.log(`[publish-release] Nenhuma release ${TAG} encontrada — criando uma nova (draft).`);
  return api(`/repos/${OWNER}/${REPO}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: TAG, name: pkg.version, draft: true }),
  });
}

async function deleteExistingAsset(releaseId, fileName) {
  const assets = await api(`/repos/${OWNER}/${REPO}/releases/${releaseId}/assets`);
  const existing = assets.find((a) => a.name === fileName);
  if (existing) {
    console.log(`[publish-release] ${fileName} já existia na release — substituindo.`);
    await api(`/repos/${OWNER}/${REPO}/releases/assets/${existing.id}`, { method: 'DELETE' });
  }
}

async function uploadAsset(release, filePath) {
  // O instalador NSIS do Windows sai do electron-builder com espaço no nome
  // no disco (ex.: "Zynk Setup 0.7.1.exe"), mas latest.yml referencia a
  // versão com hífen ("Zynk-Setup-0.7.1.exe") — é assim que o
  // electron-builder de fato publica. Sem sanitizar aqui, o nome do asset no
  // GitHub não bateria com a URL que o auto-updater vai tentar baixar
  // (404 silencioso, update nunca chega).
  const fileName = path.basename(filePath).replace(/ /g, '-');
  await deleteExistingAsset(release.id, fileName);

  const data = fs.readFileSync(filePath);
  const contentType = path.extname(fileName).toLowerCase() === '.yml' ? 'text/yaml' : 'application/octet-stream';
  const uploadUrl = release.upload_url.split('{')[0];

  const res = await fetch(`${uploadUrl}?name=${encodeURIComponent(fileName)}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': contentType, 'Content-Length': String(data.length) },
    body: data,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Falha ao subir ${fileName}: ${res.status} ${body}`);
  }
  console.log(`[publish-release] ✓ ${fileName} (${(data.length / 1024 / 1024).toFixed(1)} MB)`);
}

function collectAssets() {
  if (!fs.existsSync(RELEASE_DIR)) {
    throw new Error(`Pasta não encontrada: ${RELEASE_DIR} — rode build:win/build:linux antes.`);
  }
  return fs
    .readdirSync(RELEASE_DIR, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => ASSET_EXTENSIONS.has(path.extname(name).toLowerCase()))
    // `release/` acumula os builds de TODAS as versões já geradas ali (nunca
    // é limpa sozinha) — os latest*.yml são sempre sobrescritos na hora (só
    // existe o mais novo), mas exe/blockmap/AppImage ficam com o número da
    // versão no nome e vão se empilhando. Sem esse filtro, subiria o
    // histórico inteiro de builds antigos pra dentro da release atual.
    .filter((name) => /^latest.*\.yml$/i.test(name) || name.includes(pkg.version))
    .map((name) => path.join(RELEASE_DIR, name));
}

async function main() {
  if (!token) throw new Error('GH_TOKEN não definido (esperado no .env).');

  const assets = collectAssets();
  if (assets.length === 0) throw new Error('Nenhum artefato encontrado em release/ — rode build:win/build:linux antes.');

  console.log(`[publish-release] ${assets.length} arquivo(s) pra subir:`);
  assets.forEach((f) => console.log('  -', path.basename(f)));

  const release = await getOrCreateRelease();
  // Sequencial de propósito — é exatamente a concorrência que causava o bug.
  for (const filePath of assets) {
    await uploadAsset(release, filePath);
  }

  console.log(`[publish-release] Pronto: https://github.com/${OWNER}/${REPO}/releases/tag/${TAG}`);
}

main().catch((err) => {
  console.error('[publish-release] ERRO:', err.message);
  process.exit(1);
});
