module.exports = {
  packagerConfig: {
    name: 'NYC Elite Reservations',
    executableName: 'nyc-elite-reservations',
    asar: true,
    dir: '.',
    out: './out/forge',
    ignore: [
      /^\/src$/,
      /^\/\.git/,
      /^\/node_modules\/\.cache/,
      /\.md$/
    ],
    extraResource: []
  },
  rebuildConfig: {
    // Rebuild native modules (better-sqlite3) for the packaged Electron version
    force: true
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'NYCEliteReservations',
        setupExe: 'NYC-Elite-Reservations-Setup.exe',
        description: 'NYC Elite Restaurant Reservation System'
      }
    }
  ]
}
