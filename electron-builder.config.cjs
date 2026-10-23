// Distribute the selected, byte-verified exhibition assets with Chromium/Node.
module.exports = {
  appId: 'cn.mdgs.digital-peony',
  productName: '数字牡丹赋',
  directories: { app: 'desktop', output: 'dist-desktop' },
  electronVersion: require('./package.json').devDependencies.electron,
  electronDist: 'node_modules/electron/dist',
  files: ['main.cjs', 'preload.cjs', 'package.json', 'icon.ico'],
  extraResources: [{
    from: 'dist-exhibition', to: 'web',
    filter: ['**/*', '.mdgs-exhibition-package.json', '!serve.cjs', '!启动展览.cmd', '!运行说明.txt'],
  }],
  asar: true,
  npmRebuild: false,
  compression: 'normal',
  win: {
    target: [{ target: 'portable', arch: ['x64'] }],
    executableName: '数字牡丹赋',
    artifactName: '数字牡丹赋.exe',
    icon: 'desktop/icon.ico',
    requestedExecutionLevel: 'asInvoker',
  },
  portable: { requestExecutionLevel: 'user', unpackDirName: false },
};
