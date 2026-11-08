declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    DATABASE_URL?: string;
    DATABASE_CA_CERT?: string;
    TUXU_POSTGRES_LOCAL_PORT?: string;
  }
}
