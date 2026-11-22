// OpenNext Cloudflare adapter config. https://opennext.js.org/cloudflare
// No incremental cache yet; add the R2 cache override when ISR/revalidation is used.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
