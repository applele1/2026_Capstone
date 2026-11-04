import {app} from './app.js';
import {config} from './config.js';
import {initializeStore} from './models/store.js';
await initializeStore();
app.listen(config.port, () => console.log(`밥잇: http://localhost:${config.port} (${config.storage})`));
