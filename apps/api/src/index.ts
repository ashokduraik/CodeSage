import { buildApp } from "./http/app";
import { loadConfig } from "./platform/config";

const config = loadConfig();
const app = buildApp(config);

app.listen({ host: config.host, port: config.port }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
