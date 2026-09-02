import { app } from './app.js';
import { config } from './lib/config.js';

app.listen(config.port, () => {
  console.log(`Skills Manager em ${config.publicUrl} (porta ${config.port}, ${config.isProduction ? 'produção' : 'desenvolvimento'})`);
});
