module.exports = {
  apps: [{
    name: 'pgb-eos',
    script: 'dist/index.js',
    cwd: '/opt/pgb-eos/server',
    env: { NODE_ENV: 'production' },
  }],
};
