import 'dotenv/config';

export interface AppConfig {
  env: string;
  port: number;
}

const env = process.env.NODE_ENV || 'development';
const port = Number(process.env.PORT) || 3000;

export const config: AppConfig = {
  env,
  port,
};

export default config;
