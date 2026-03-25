const { rcedit } = require('rcedit');
const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return;

  const exePath = path.join(context.appOutDir, 'Zynk.exe');
  const icoPath = path.join(__dirname, '..', 'build', 'icon.ico');

  console.log('[set-icon] Setting icon on', exePath);
  await rcedit(exePath, { icon: icoPath });
  console.log('[set-icon] Icon set successfully.');
};
