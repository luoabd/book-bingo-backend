import * as dotenv from "dotenv";

dotenv.config();
const prod_url = process.env.PROD_URL;

const production = {
    url: prod_url,
    port: 4000
}

const development = {
    url: 'http://localhost:3000',
    port: 3000
}

export const config = process.env.NODE_ENV === 'production' ? production : development