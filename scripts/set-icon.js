const { rcedit } = require('rcedit');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// O antivírus costuma escanear o .exe recém-copiado pelo electron-builder e
// segurar um lock nele por um instante — o rcedit falha com "Unable to
// commit changes" bem nessa janela. O lock costuma sumir em 1-2s, então
// tentar de novo com um pequeno atraso resolve sem precisar desativar o AV
// ou mexer em exclusões.
const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 1500;

exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return;

  const exePath = path.join(context.appOutDir, 'Zynk.exe');
  const icoPath = path.join(__dirname, '..', 'build', 'icon.ico');

  console.log('[set-icon] Setting icon on', exePath);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await rcedit(exePath, { icon: icoPath });
      console.log('[set-icon] Icon set successfully.');
      return;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      console.log(`[set-icon] Attempt ${attempt}/${MAX_ATTEMPTS} failed (provavelmente lock do antivírus) — tentando de novo em ${RETRY_DELAY_MS}ms...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
};
