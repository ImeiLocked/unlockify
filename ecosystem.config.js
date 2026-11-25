// Configuracion de PM2 para mantener la app prendida 24/7
// Uso:  pm2 start ecosystem.config.js  &&  pm2 save
module.exports = {
  apps: [
    {
      name: 'unlock-reseller',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
      autorestart: true,
    },
  ],
};
